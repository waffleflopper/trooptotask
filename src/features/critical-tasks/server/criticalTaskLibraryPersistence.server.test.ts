import { createClient } from '@supabase/supabase-js';
import { setImmediate } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { createSupabaseCriticalTaskLibraryPersistence } from './criticalTaskLibraryPersistence.server';
import {
	CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE,
	ICT_TASK_ORDER_CHANGED_MESSAGE,
	ICT_TASK_UNAVAILABLE_MESSAGE
} from '../contracts';
import { isUnconfirmedWrite } from './criticalTaskWriteOutcome.server';
import { importIctTasksBatch } from './ictTasksBatch.server';
import { createWritePortsContext } from './criticalTasksPersistence.test-support.server';
import { createShiftingPostgrestClient, pagedIds } from '$lib/storage/test-support/shiftingPostgrest.server';

type Row = Record<string, unknown>;

const without = (row: Row, field: string) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== field));

function provider(initialRows: Row[] = []) {
	const rows = structuredClone(initialRows);
	const state = {
		requests: [] as Array<{ url: URL; method: string; body: unknown }>,
		reject: null as { method: string; code: string; message: string } | null,
		failOffset: null as number | null,
		failReference: null as string | null,
		rejectRow: null as { op: string; code: string } | null,
		rejectCodes: new Set<string>(),
		acknowledgment: null as { data: unknown } | null,
		holdReferencedResponses: false,
		heldResponses: [] as Array<() => void>,
		inFlight: 0,
		peak: 0,
		writes: 0,
		loseReply: null as { write: number; as: 'transport' | 'unavailable' } | null,
		failReadsAfterLostReply: false,
		dropWrite: null as number | null,
		readbackLimit: null as number | null,
		replyLost: false,
		ackWithout: '',
		readbackWithout: ''
	};
	const uniqueTaskCode = (candidates: Row[]) =>
		new Set(candidates.map((row) => `${row.organization_id}:${row.task_code}`)).size === candidates.length;
	const duplicate = (constraint: string) =>
		Response.json(
			{ code: '23505', message: `duplicate key value violates unique constraint "${constraint}"` },
			{ status: 409 }
		);
	const client = createClient('http://task-library.invalid', 'ordinary-request-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				const body: unknown = request.method === 'GET' ? null : await request.json();
				state.requests.push({ url, method: request.method, body });
				if (
					state.requests.length > 60 ||
					url.origin !== 'http://task-library.invalid' ||
					!['/rest/v1/ict_tasks', '/rest/v1/rpc/import_ict_tasks'].includes(url.pathname)
				)
					throw new Error('Unexpected task provider operation');
				if (
					request.headers.get('authorization') !== 'Bearer ordinary-request-key' ||
					request.headers.get('apikey') !== 'ordinary-request-key'
				)
					throw new Error('Task provider changed supplied authority');
				state.inFlight += 1;
				state.peak = Math.max(state.peak, state.inFlight);
				if (state.holdReferencedResponses && url.searchParams.get('id')?.startsWith('in.(')) {
					await new Promise<void>((resolve) => state.heldResponses.push(resolve));
				} else {
					await Promise.resolve();
				}
				state.inFlight -= 1;
				const offset = Number(url.searchParams.get('offset') ?? 0);
				if (request.method !== 'GET') state.writes += 1;
				if (request.method === 'GET' && state.failReadsAfterLostReply && state.replyLost)
					return Response.json(
						{ message: 'Task provider unavailable' },
						{ status: 503, headers: { 'Retry-After': '0' } }
					);
				if (state.reject?.method === request.method) return Response.json(state.reject, { status: 403 });
				if (
					request.method === 'GET' &&
					(state.failOffset === offset ||
						(state.failReference && url.searchParams.get('id')?.includes(state.failReference)))
				)
					return Response.json(
						{ message: 'Required task catalog unavailable' },
						{ status: 503, headers: { 'Retry-After': '0' } }
					);
				let imported: Row[] | null = null;
				let affected = rows.filter((row) => {
					for (const [column, filter] of url.searchParams) {
						if (['select', 'order', 'offset', 'limit', 'columns'].includes(column)) continue;
						if (filter.startsWith('eq.')) {
							if (String(row[column]) !== filter.slice(3)) return false;
						} else if (filter === 'is.null') {
							if (row[column] != null) return false;
						} else if (filter.startsWith('in.(')) {
							if (!filter.slice(4, -1).split(',').includes(String(row[column]))) return false;
						} else throw new Error('Unexpected task predicate');
					}
					return true;
				});
				if (request.method === 'GET') {
					const order = url.searchParams.get('order');
					if (order) {
						affected.sort((a, b) => {
							for (const term of order.split(',')) {
								const [column, direction] = term.split('.');
								const left = a[column],
									right = b[column];
								const compared =
									typeof left === 'number' && typeof right === 'number'
										? left - right
										: String(left).localeCompare(String(right));
								if (compared) return direction === 'desc' ? -compared : compared;
							}
							return 0;
						});
					}
					affected = affected.slice(offset, offset + Number(url.searchParams.get('limit') ?? 1000));
					if (state.replyLost && state.readbackLimit !== null) affected = affected.slice(0, state.readbackLimit);
					if (state.replyLost && state.readbackWithout)
						affected = affected.map((row) => without(row, state.readbackWithout));
				} else if (url.pathname === '/rest/v1/rpc/import_ict_tasks') {
					if (state.dropWrite === state.writes) throw new TypeError('fetch failed');
					const { p_organization_id: orgId, p_rows: items } = body as {
						p_organization_id: string;
						p_rows: Array<{ op: string; id: string; values: Row }>;
					};
					imported = items.map(({ op, id, values }) => {
						if (state.rejectRow?.op === op) return { code: state.rejectRow.code, constraint: null };
						if (op === 'insert') {
							if (state.rejectCodes.has(String(values.task_code))) return { code: '23514', constraint: null };
							const created = { id, organization_id: orgId, created_at: '2026-10-06T12:00:00.123456Z', ...values };
							if (rows.some((row) => row.id === id)) return { code: '23505', constraint: 'ict_tasks_pkey' };
							if (!uniqueTaskCode([...rows, created]))
								return { code: '23505', constraint: 'ict_tasks_organization_id_task_code_key' };
							rows.push(created);
							return { row: state.ackWithout ? without(created, state.ackWithout) : created };
						}
						const row = rows.find((candidate) => candidate.id === id && candidate.organization_id === orgId);
						if (!row) return { code: 'P0002', constraint: null };
						Object.assign(row, values);
						return { row: state.ackWithout ? without(row, state.ackWithout) : { ...row } };
					});
				} else if (request.method === 'POST') {
					if (state.dropWrite === state.writes) throw new TypeError('fetch failed');
					const created: Row = { created_at: '2026-10-06T12:00:00.123456Z', ...(body as Row) };
					if (rows.some((row) => row.id === created.id)) return duplicate('ict_tasks_pkey');
					if (!uniqueTaskCode([...rows, created])) return duplicate('ict_tasks_organization_id_task_code_key');
					affected = [created];
					rows.push(created);
					if (state.ackWithout) affected = affected.map((row) => without(row, state.ackWithout));
				} else if (request.method === 'PATCH') {
					const next = rows.map((row) => (affected.includes(row) ? { ...row, ...(body as Row) } : row));
					if (!uniqueTaskCode(next)) return duplicate('ict_tasks_organization_id_task_code_key');
					for (const row of affected) Object.assign(row, body);
					if (state.ackWithout) affected = affected.map((row) => without(row, state.ackWithout));
				} else throw new Error('Unexpected task method');
				if (request.method !== 'GET' && state.loseReply?.write === state.writes) {
					state.replyLost = true;
					if (state.loseReply.as === 'transport') throw new TypeError('fetch failed');
					return Response.json(
						{ code: 'T2T_VERIFY_PROVIDER_FAULT', message: 'Synthetic provider fault after commit' },
						{ status: 503 }
					);
				}
				if (imported) return Response.json(state.acknowledgment ? state.acknowledgment.data : imported);
				const select = url.searchParams.get('select');
				const projected = affected.map((row) =>
					select && select !== '*' ? Object.fromEntries(select.split(',').map((column) => [column, row[column]])) : row
				);
				if (request.method !== 'GET' && !request.headers.get('prefer')?.includes('return=representation'))
					return new Response(null, { status: 204 });
				if (state.acknowledgment && request.method !== 'GET') return Response.json(state.acknowledgment.data);
				if (request.headers.get('accept') === 'application/vnd.pgrst.object+json') {
					if (projected.length !== 1)
						return Response.json({ code: 'PGRST116', message: 'Expected one task' }, { status: 406 });
					return Response.json(projected[0]);
				}
				return Response.json(projected);
			}
		}
	});
	return { rows, state, client, library: createSupabaseCriticalTaskLibraryPersistence(client, 'org-a') };
}

const saved: Row = {
	id: 'active-a',
	organization_id: 'org-a',
	task_code: 'RESP-200',
	title: 'Ventilator setup',
	description: 'Retained description',
	category: 'Respiratory',
	mos: ['68V', '68W'],
	expiration_months: 18,
	sort_order: 2,
	archived_at: null,
	created_at: '2026-01-01T00:00:00.123456Z',
	updated_at: '2026-10-01T00:00:00Z',
	extra_saved_field: 'private'
};
const expected = {
	id: 'active-a',
	taskCode: 'RESP-200',
	title: 'Ventilator setup',
	description: 'Retained description',
	category: 'Respiratory',
	mos: ['68V', '68W'],
	expirationMonths: 18,
	sortOrder: 2,
	archivedAt: null,
	createdAt: '2026-01-01T00:00:00.123456Z'
};
const taskFields = new Set([
	'id',
	'task_code',
	'title',
	'description',
	'category',
	'mos',
	'expiration_months',
	'sort_order',
	'archived_at',
	'created_at'
]);

describe('owned Critical Tasks library provider', () => {
	it('returns explicit ordered active/all DTOs with ordinary authority and a narrow projection', async () => {
		const { library, state } = provider([
			saved,
			{
				...saved,
				id: 'archived-a',
				task_code: 'RESP-100',
				title: 'Archived',
				sort_order: 1,
				archived_at: '2026-09-01T00:00:00Z',
				mos: null,
				description: null,
				category: null,
				expiration_months: null
			},
			{ ...saved, id: 'foreign-b', organization_id: 'org-b', sort_order: 0 }
		]);
		expect(await library.listCatalog()).toEqual([expected]);
		expect(await library.listCatalog({ includeArchived: true })).toEqual([
			{
				id: 'archived-a',
				taskCode: 'RESP-100',
				title: 'Archived',
				description: null,
				category: null,
				mos: [],
				expirationMonths: null,
				sortOrder: 1,
				archivedAt: '2026-09-01T00:00:00Z',
				createdAt: '2026-01-01T00:00:00.123456Z'
			},
			expected
		]);
		expect((await library.listImportCandidates()).map((task) => task.id)).toEqual(['active-a', 'archived-a']);
		for (const { url } of state.requests)
			expect(
				new Set(
					url.searchParams
						.get('select')
						?.split(',')
						.map((column) => column.trim())
				)
			).toEqual(taskFields);
	});

	it('completes 1001 tasks without admitting a foreign or archived tail', async () => {
		const rows: Row[] = Array.from({ length: 1001 }, (_, index) => ({
			...saved,
			id: `task-${index}`,
			task_code: `RESP-${index}`,
			sort_order: index
		}));
		rows[1000] = { ...rows[1000], title: 'Final oxygen check', mos: ['68V'], category: null, expiration_months: null };
		const { library } = provider([
			...rows,
			{ ...saved, id: 'foreign-tail', organization_id: 'org-b' },
			{ ...saved, id: 'archived-tail', archived_at: '2026-09-01T00:00:00Z' }
		]);
		const tasks = await library.listCatalog();
		expect(tasks).toHaveLength(1001);
		expect(tasks[1000]).toEqual({
			id: 'task-1000',
			taskCode: 'RESP-1000',
			title: 'Final oxygen check',
			description: 'Retained description',
			category: null,
			mos: ['68V'],
			expirationMonths: null,
			sortOrder: 1000,
			archivedAt: null,
			createdAt: '2026-01-01T00:00:00.123456Z'
		});
		const candidates = await library.listImportCandidates();
		expect(candidates).toHaveLength(1002);
		expect(candidates).toContainEqual(
			expect.objectContaining({ id: 'archived-tail', archivedAt: '2026-09-01T00:00:00Z' })
		);
	});

	it('returns an empty catalog and rejects reference read failures', async () => {
		const { library, state } = provider();
		expect(await library.listCatalog()).toEqual([]);
		expect(await library.listImportCandidates()).toEqual([]);
		state.failOffset = 0;
		await expect(library.listReferenced(['active-a'])).rejects.toThrow('Required task catalog unavailable');
		await expect(library.findReference('active-a')).rejects.toThrow('Required task catalog unavailable');
	});

	it.each([0, 1000])('rejects the whole catalog when page offset %i fails', async (offset) => {
		const { library, state } = provider(
			Array.from({ length: 1001 }, (_, index) => ({ ...saved, id: `task-${index}` }))
		);
		state.failOffset = offset;
		await expect(library.listCatalog()).rejects.toThrow('Required task catalog unavailable');
		await expect(library.listImportCandidates()).rejects.toThrow('Required task catalog unavailable');
	});

	it('acknowledges every saved row of an import in one Organization-bound call', async () => {
		const { library, rows, state } = provider();
		const bulk = await library.importMany([
			{
				create: {
					taskCode: 'BULK-1',
					title: 'First',
					description: 'Notes',
					category: 'Airway',
					mos: ['68V'],
					expirationMonths: 6,
					sortOrder: 9,
					archivedAt: '2026-09-01T00:00:00Z'
				}
			},
			{ create: { taskCode: 'BULK-2', title: 'Second' } }
		]);
		expect(bulk).toEqual([
			{
				id: expect.any(String),
				taskCode: 'BULK-1',
				title: 'First',
				description: 'Notes',
				category: 'Airway',
				mos: ['68V'],
				expirationMonths: 6,
				sortOrder: 9,
				archivedAt: '2026-09-01T00:00:00Z',
				createdAt: '2026-10-06T12:00:00.123456Z'
			},
			{
				id: expect.any(String),
				taskCode: 'BULK-2',
				title: 'Second',
				description: null,
				category: null,
				mos: [],
				expirationMonths: null,
				sortOrder: 0,
				archivedAt: null,
				createdAt: '2026-10-06T12:00:00.123456Z'
			}
		]);
		expect(bulk.map((task) => (task instanceof Error ? task : task.id))).toEqual(rows.map((row) => row.id));
		expect(rows.map((row) => row.organization_id)).toEqual(['org-a', 'org-a']);
		expect(state.requests.map((request) => request.url.pathname)).toEqual(['/rest/v1/rpc/import_ict_tasks']);
	});

	it('bounds referenced metadata, retains archived references and excludes unrequested/foreign tasks', async () => {
		const ids = Array.from({ length: 501 }, (_, index) => `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
		const { library, state } = provider([
			...ids.map((id, index) => ({
				...saved,
				id,
				sort_order: index,
				archived_at: index === 500 ? '2026-09-01T00:00:00Z' : null
			})),
			{ ...saved, id: 'unrequested' },
			{ ...saved, id: 'foreign-b', organization_id: 'org-b' }
		]);
		expect(await library.listReferenced([])).toEqual([]);
		expect(state.requests).toEqual([]);
		state.holdReferencedResponses = true;
		const pending = library.listReferenced([...ids, ids[0], 'foreign-b', 'missing']);
		await setImmediate();
		state.holdReferencedResponses = false;
		for (const release of state.heldResponses.splice(0)) release();
		const tasks = await pending;
		expect(tasks.map((task) => task.id)).toEqual(ids);
		expect(tasks[500].archivedAt).toBe('2026-09-01T00:00:00Z');
		expect(state.peak).toBeLessThanOrEqual(4);
		for (const { url } of state.requests) {
			expect(url.href.length).toBeLessThan(8192);
			expect(url.searchParams.get('id')?.slice(4, -1).split(',').length).toBeLessThanOrEqual(50);
		}
		state.failReference = ids[500];
		await expect(library.listReferenced(ids)).rejects.toThrow('Required task catalog unavailable');
	});

	it('returns active/archived references and null for absent or foreign IDs without leaking other fields', async () => {
		const { library, state } = provider([
			saved,
			{ ...saved, id: 'archived-a', archived_at: '2026-09-01T00:00:00Z' },
			{ ...saved, id: 'foreign-b', organization_id: 'org-b' }
		]);
		expect(await library.findReference('active-a')).toEqual({ id: 'active-a', archivedAt: null });
		expect(await library.findReference('archived-a')).toEqual({ id: 'archived-a', archivedAt: '2026-09-01T00:00:00Z' });
		expect(await library.findReference('foreign-b')).toBeNull();
		expect(await library.findReference('missing')).toBeNull();
		for (const { url } of state.requests)
			expect(new Set(url.searchParams.get('select')?.split(','))).toEqual(new Set(['id', 'archived_at']));
	});

	it('persists creation defaults and partial archive/restore without changing saved fields or another tenant', async () => {
		const { library, rows, state } = provider([saved, { ...saved, id: 'foreign-b', organization_id: 'org-b' }]);
		const created = await library.create({ taskCode: 'NEW-100', title: 'New task' });
		expect(created).toEqual({
			id: expect.any(String),
			taskCode: 'NEW-100',
			title: 'New task',
			description: null,
			category: null,
			mos: [],
			expirationMonths: null,
			sortOrder: 0,
			archivedAt: null,
			createdAt: '2026-10-06T12:00:00.123456Z'
		});
		expect(rows[2]).toEqual({
			id: created.id,
			organization_id: 'org-a',
			task_code: 'NEW-100',
			title: 'New task',
			description: null,
			category: null,
			mos: [],
			expiration_months: null,
			sort_order: 0,
			archived_at: null,
			created_at: '2026-10-06T12:00:00.123456Z'
		});
		expect(await library.update('active-a', { archivedAt: '2026-10-06T13:00:00.654321Z' })).toEqual({
			...expected,
			archivedAt: '2026-10-06T13:00:00.654321Z'
		});
		expect(await library.update('active-a', { archivedAt: null, category: null })).toEqual({
			...expected,
			category: null
		});
		expect(await library.update('foreign-b', { title: 'Foreign changed' })).toBeNull();
		expect(rows[1].title).toBe('Ventilator setup');
		const before = state.requests.length;
		expect(await library.importMany([])).toEqual([]);
		expect(state.requests).toHaveLength(before);
	});

	it('saves one import of new and existing tasks in a single write', async () => {
		const { library, rows, state } = provider([{ ...saved, archived_at: '2026-09-01T00:00:00Z' }]);
		const ctx = createWritePortsContext({ auth: { orgId: 'org-a' } });

		const reply = await importIctTasksBatch(
			{ ...ctx, criticalTaskLibrary: library },
			{
				records: [
					{ taskCode: 'RESP-200', title: 'Restored' },
					{ taskCode: 'NEW-1', title: 'New' }
				]
			}
		);

		expect(addedCodes(reply)).toEqual(['updated RESP-200', 'added NEW-1']);
		expect(state.requests.filter((request) => request.method !== 'GET').map((request) => request.url.pathname)).toEqual(
			['/rest/v1/rpc/import_ict_tasks']
		);
		expect(rows.map((row) => [row.task_code, row.title, row.archived_at])).toEqual([
			['RESP-200', 'Restored', null],
			['NEW-1', 'New', null]
		]);
	});

	it.each(['create', 'importMany', 'update'] as const)(
		'rejects %s provider failure without a saved effect',
		async (operation) => {
			const { library, rows, state } = provider([saved]);
			state.reject = { method: operation === 'update' ? 'PATCH' : 'POST', code: '42501', message: 'Task write denied' };
			const pending =
				operation === 'create'
					? library.create({ taskCode: 'NEW', title: 'New' })
					: operation === 'importMany'
						? library.importMany([{ create: { taskCode: 'NEW', title: 'New' } }])
						: library.update('active-a', { title: 'Changed' });
			await expect(pending).rejects.toThrow('Task write denied');
			expect(rows).toEqual([saved]);
		}
	);

	it.each(['create', 'update'] as const)('preserves the named task-code conflict for %s', async (operation) => {
		const { library, state } = provider([saved]);
		state.reject = {
			method: operation === 'update' ? 'PATCH' : 'POST',
			code: '23505',
			message: 'duplicate key violates unique constraint "ict_tasks_organization_id_task_code_key"'
		};
		const pending =
			operation === 'create'
				? library.create({ taskCode: 'RESP-200', title: 'Duplicate' })
				: library.update('active-a', { taskCode: 'RESP-200' });
		await expect(pending).rejects.toMatchObject({ status: 409 });
	});

	it.each(['create', 'update'] as const)(
		'leaves unrelated %s constraint errors as provider errors',
		async (operation) => {
			const { library, state } = provider([saved]);
			state.reject = {
				method: operation === 'update' ? 'PATCH' : 'POST',
				code: '23505',
				message: 'Unrelated uniqueness constraint'
			};
			const pending =
				operation === 'create'
					? library.create({ taskCode: 'NEW', title: 'New' })
					: library.update('active-a', { title: 'Changed' });
			await expect(pending).rejects.toThrow('Unrelated uniqueness constraint');
			await expect(pending).rejects.not.toHaveProperty('status');
		}
	);

	it('answers each import row with its own saved task or error', async () => {
		const { library, rows, state } = provider([saved]);
		state.rejectCodes.add('FAIL');
		const [duplicate, missing, refused, added, updated] = await library.importMany([
			{ create: { taskCode: 'RESP-200', title: 'Duplicate' } },
			{ id: 'missing', patch: { title: 'Changed' } },
			{ create: { taskCode: 'FAIL', title: 'Refused' } },
			{ create: { taskCode: 'NEW', title: 'New' } },
			{ id: 'active-a', patch: { title: 'Changed' } }
		]);
		expect(duplicate).toMatchObject({ status: 409 });
		expect(missing).toMatchObject({ status: 404, message: ICT_TASK_UNAVAILABLE_MESSAGE });
		expect(refused).toBeInstanceOf(Error);
		expect(refused).not.toHaveProperty('status');
		expect(added).toMatchObject({ taskCode: 'NEW', title: 'New' });
		expect(updated).toEqual({ ...expected, title: 'Changed' });
		expect(rows.map((row) => [row.task_code, row.title])).toEqual([
			['RESP-200', 'Changed'],
			['NEW', 'New']
		]);
	});

	it.each([null, {}, { id: 17 }, [], { id: '' }])(
		'confirms a created task by reading it back after malformed acknowledgment %j',
		async (data) => {
			const { library, rows, state } = provider();
			state.acknowledgment = { data };
			const created = await library.create({ taskCode: 'NEW', title: 'New' });
			expect(created).toMatchObject({ taskCode: 'NEW', title: 'New' });
			expect(created.id).toBe(rows[0].id);
			expect(rows.map((row) => row.task_code)).toEqual(['NEW']);
			expect(state.requests.filter((request) => request.method === 'POST')).toHaveLength(1);
		}
	);

	it('leaves wrong-ID, incomplete and malformed acknowledgments unconfirmed or read back, never as invented success', async () => {
		const { library, rows, state } = provider([saved]);
		state.acknowledgment = { data: { ...saved, id: 'wrong-id' } };
		await expect(library.update('active-a', { title: 'Changed' })).rejects.toSatisfy(isUnconfirmedWrite);
		state.acknowledgment = { data: [{ row: { ...saved, id: 'wrong-id' } }] };
		await expect(library.importMany([{ create: { taskCode: 'NEW', title: 'New' } }])).resolves.toMatchObject([
			{ taskCode: 'NEW' }
		]);
		state.acknowledgment = { data: [{}] };
		await expect(library.importMany([{ create: { taskCode: 'NEW-2', title: 'New' } }])).resolves.toMatchObject([
			{ taskCode: 'NEW-2' }
		]);
		state.acknowledgment = { data: [] };
		const [created, updated] = await library.importMany([
			{ create: { taskCode: 'NEW-3', title: 'New' } },
			{ id: 'active-a', patch: { title: 'Changed' } }
		]);
		expect(created).toMatchObject({ taskCode: 'NEW-3' });
		expect(updated).toSatisfy(isUnconfirmedWrite);
		expect(rows.map((row) => row.task_code)).toEqual(['RESP-200', 'NEW', 'NEW-2', 'NEW-3']);
	});

	it('reads back generated ids when an acknowledgment carries them without the saved task fields', async () => {
		const { library, rows, state } = provider();
		state.ackWithout = 'title';
		const created = await library.create({ taskCode: 'ONE', title: 'First' });
		const imported = await library.importMany([
			{ create: { taskCode: 'TWO', title: 'Second' } },
			{ create: { taskCode: 'THREE', title: 'Third' } }
		]);
		expect([created, ...imported].map((task) => (task instanceof Error ? task : [task.id, task.title]))).toEqual(
			rows.map((row) => [row.id, row.title])
		);
		expect(state.requests.filter((request) => request.method === 'POST')).toHaveLength(2);
		expect(state.requests.filter((request) => request.method === 'GET')).toHaveLength(2);
	});

	it('leaves an update unconfirmed when its acknowledgment lacks saved task fields', async () => {
		const { library, rows, state } = provider([saved]);
		state.ackWithout = 'title';
		await expect(library.update('active-a', { title: 'Changed' })).rejects.toSatisfy(isUnconfirmedWrite);
		expect(rows[0].title).toBe('Changed');
		const [imported] = await library.importMany([{ id: 'active-a', patch: { title: 'Imported' } }]);
		expect(imported).toSatisfy(isUnconfirmedWrite);
		expect(rows[0].title).toBe('Imported');
		expect(state.requests.filter((request) => request.method === 'GET')).toHaveLength(0);
	});

	it('keeps rows unconfirmed when the read-back returns rows without the saved task fields', async () => {
		const { library, rows, state } = provider();
		state.loseReply = { write: 1, as: 'transport' };
		state.readbackWithout = 'title';
		await expect(
			library.importMany([
				{ create: { taskCode: 'LOST-1', title: 'First' } },
				{ create: { taskCode: 'LOST-2', title: 'Second' } }
			])
		).rejects.toSatisfy(isUnconfirmedWrite);
		expect(rows).toHaveLength(2);
		expect(state.requests.filter((request) => request.method === 'POST')).toHaveLength(1);
	});

	it('resolves null for an update that matches no saved row', async () => {
		const { library, rows } = provider([saved]);
		expect(await library.update('missing', { title: 'Changed' })).toBeNull();
		expect(rows).toEqual([saved]);
	});

	it('keeps row success beside a refused row in one import, with a restored task identity', async () => {
		const { library, rows, state } = provider([
			{ ...saved, id: 'restore-a', task_code: 'OLD', archived_at: '2026-09-01T00:00:00Z' }
		]);
		state.rejectCodes.add('FAIL');
		const ctx = createWritePortsContext({ auth: { orgId: 'org-a' } });
		const reply = await importIctTasksBatch(
			{ ...ctx, criticalTaskLibrary: library },
			{
				records: [
					{ taskCode: 'PASS', title: 'Kept task' },
					{ taskCode: 'FAIL', title: 'Rejected task' },
					{ taskCode: 'OLD', title: 'Restored task' }
				]
			}
		);
		expect(
			reply.results.map((result) => {
				if (result.kind === 'failed' || result.kind === 'unconfirmed') return [result.kind, result.message];
				if (result.kind === 'unchanged') return [result.kind];
				return [result.kind, result.record.id, result.record.title, result.record.archivedAt];
			})
		).toEqual([
			['added', rows[1].id, 'Kept task', null],
			['failed', 'This task could not be saved.'],
			['updated', 'restore-a', 'Restored task', null]
		]);
		expect(rows.map((row) => [row.id, row.task_code, row.archived_at])).toEqual([
			['restore-a', 'OLD', null],
			[expect.any(String), 'PASS', null]
		]);
	});
});

const lostRecords = [
	{ taskCode: 'LOST-1', title: 'First' },
	{ taskCode: 'LOST-2', title: 'Second' }
];

function importLost(library: ReturnType<typeof provider>['library'], records = lostRecords) {
	const ctx = createWritePortsContext({ auth: { orgId: 'org-a' } });
	return { ctx, pending: importIctTasksBatch({ ...ctx, criticalTaskLibrary: library }, { records }) };
}

const addedCodes = (reply: Awaited<ReturnType<typeof importIctTasksBatch>>) =>
	reply.results.map((result) => {
		if (result.kind === 'failed') return result.message;
		if (result.kind === 'unchanged' || result.kind === 'unconfirmed') return result.kind;
		return `${result.kind} ${result.record.taskCode}`;
	});

describe('#1643 task import recovery after a lost provider reply', () => {
	it.each(['transport', 'unavailable'] as const)(
		'reports a committed bulk insert as created when its reply is lost (%s)',
		async (lost) => {
			const { library, rows, state } = provider();
			state.loseReply = { write: 1, as: lost };
			const { pending } = importLost(library);
			expect(addedCodes(await pending)).toEqual(['added LOST-1', 'added LOST-2']);
			expect(rows.map((row) => row.task_code)).toEqual(['LOST-1', 'LOST-2']);
			expect(state.requests.filter((request) => request.method === 'POST')).toHaveLength(1);
		}
	);

	it.each(['transport', 'unavailable'] as const)(
		'returns a committed single create when its reply is lost (%s)',
		async (lost) => {
			const { library, rows, state } = provider();
			state.loseReply = { write: 1, as: lost };
			await expect(library.create({ taskCode: 'LOST-1', title: 'First' })).resolves.toMatchObject({
				taskCode: 'LOST-1',
				title: 'First'
			});
			expect(rows.map((row) => row.task_code)).toEqual(['LOST-1']);
		}
	);

	it('reports each row as unconfirmed, without blind retries, when the insert reply and read-back both fail', async () => {
		const { library, rows, state } = provider();
		state.loseReply = { write: 1, as: 'transport' };
		state.failReadsAfterLostReply = true;
		const { pending } = importLost(library);
		expect((await pending).results).toEqual([
			{ kind: 'unconfirmed', message: CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE },
			{ kind: 'unconfirmed', message: CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE }
		]);
		expect(rows.map((row) => row.task_code)).toEqual(['LOST-1', 'LOST-2']);
		expect(state.requests.filter((request) => request.method === 'POST')).toHaveLength(1);
	});

	it('does not resubmit rows as new tasks when the insert never committed and the read-back finds nothing', async () => {
		const { library, rows, state } = provider();
		state.dropWrite = 1;
		const { pending } = importLost(library);
		expect((await pending).results).toEqual([
			{ kind: 'unconfirmed', message: CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE },
			{ kind: 'unconfirmed', message: CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE }
		]);
		expect(rows).toEqual([]);
		expect(state.requests.filter((request) => request.method === 'POST')).toHaveLength(1);
	});

	it('reports each row as unconfirmed when the read-back finds only some of the generated ids', async () => {
		const { library, rows, state } = provider();
		state.loseReply = { write: 1, as: 'transport' };
		state.readbackLimit = 1;
		const { pending } = importLost(library);
		expect((await pending).results).toEqual([
			{ kind: 'unconfirmed', message: CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE },
			{ kind: 'unconfirmed', message: CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE }
		]);
		expect(rows.map((row) => row.task_code)).toEqual(['LOST-1', 'LOST-2']);
		expect(state.requests.filter((request) => request.method === 'POST')).toHaveLength(1);
	});

	it('reconciles a full 500-row insert with bounded read-back requests', async () => {
		const { library, rows, state } = provider();
		state.loseReply = { write: 1, as: 'transport' };
		const created = await library.importMany(
			Array.from({ length: 500 }, (_, index) => ({ create: { taskCode: `BULK-${index}`, title: `Task ${index}` } }))
		);
		expect(created.map((task) => (task instanceof Error ? task : task.taskCode))).toEqual(
			rows.map((row) => row.task_code)
		);
		expect(created).toHaveLength(500);
		expect(state.requests.map((request) => request.method)).toEqual(['POST', ...Array(10).fill('GET')]);
		expect(state.peak).toBeLessThanOrEqual(4);
	});

	it.each(['transport', 'unavailable'] as const)(
		'raises a public unconfirmed failure, without a read-back, when a direct update reply is lost (%s)',
		async (lost) => {
			const { library, rows, state } = provider([saved]);
			state.loseReply = { write: 1, as: lost };
			const failure = await library.update('active-a', { title: 'Changed' }).catch((error: unknown) => error);
			expect(failure).toMatchObject({
				status: 503,
				publicMessage: true,
				reason: 'write-unconfirmed',
				message: CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE
			});
			expect(state.requests.map((request) => request.method)).toEqual(['PATCH']);
			expect(rows.map((row) => row.title)).toEqual(['Changed']);
		}
	);

	it.each(['transport', 'unavailable'] as const)(
		'reports an import row whose update reply is lost (%s) as unconfirmed',
		async (lost) => {
			const { library, rows, state } = provider([saved]);
			state.loseReply = { write: 1, as: lost };
			const { pending } = importLost(library, [{ taskCode: 'RESP-200', title: 'Changed' }]);
			expect((await pending).results).toEqual([
				{ kind: 'unconfirmed', message: CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE }
			]);
			expect(rows.map((row) => [row.task_code, row.title])).toEqual([['RESP-200', 'Changed']]);
		}
	);

	it('keeps a refused update as a failed row even though its requested content can match', async () => {
		const { library, rows, state } = provider([saved]);
		state.rejectRow = { op: 'update', code: '42501' };
		const { pending } = importLost(library, [{ taskCode: 'RESP-200', title: 'Ventilator setup' }]);
		expect((await pending).results).toEqual([{ kind: 'failed', message: 'This task could not be saved.' }]);
		expect(rows.map((row) => row.title)).toEqual(['Ventilator setup']);
	});
});

describe('task order command', () => {
	const ORG = '00000000-0000-4000-8000-0000000000a1';
	const changes = [
		{ id: 'task-b', expectedSortOrder: 3, sortOrder: 2 },
		{ id: 'task-a', expectedSortOrder: 2, sortOrder: 3 },
		{ id: 'task-c', expectedSortOrder: 4, sortOrder: 4 }
	];
	const savedRow = (id: string, sortOrder: number) => ({
		id,
		task_code: id.toUpperCase(),
		title: `Task ${id}`,
		description: null,
		category: null,
		mos: [],
		expiration_months: null,
		sort_order: sortOrder,
		archived_at: null,
		created_at: '2026-04-01T12:00:00Z',
		organization_id: ORG,
		updated_at: '2026-10-14T12:00:00Z'
	});

	function orderRpc(reply: () => Response | Promise<Response>) {
		const calls: Array<{ path: string; body: unknown }> = [];
		const client = createClient('http://127.0.0.1:9', 'synthetic-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async (input, init) => {
					const request = new Request(input, init);
					calls.push({ path: new URL(request.url).pathname, body: await request.json() });
					return reply();
				}
			}
		});
		return { calls, port: createSupabaseCriticalTaskLibraryPersistence(client, ORG) };
	}

	it('sends changes and guards in one Organization-bound call and requires the full acknowledgement', async () => {
		const { calls, port } = orderRpc(() =>
			Response.json([savedRow('task-a', 3), savedRow('task-b', 2), savedRow('task-c', 4)])
		);

		await expect(port.reorder(changes)).resolves.toEqual([
			expect.objectContaining({ id: 'task-a', taskCode: 'TASK-A', sortOrder: 3 }),
			expect.objectContaining({ id: 'task-b', taskCode: 'TASK-B', sortOrder: 2 }),
			expect.objectContaining({ id: 'task-c', taskCode: 'TASK-C', sortOrder: 4 })
		]);
		expect(calls).toEqual([
			{
				path: '/rest/v1/rpc/reorder_ict_tasks',
				body: {
					p_organization_id: ORG,
					p_changes: [
						{ id: 'task-b', expected_sort_order: 3, sort_order: 2 },
						{ id: 'task-a', expected_sort_order: 2, sort_order: 3 },
						{ id: 'task-c', expected_sort_order: 4, sort_order: 4 }
					]
				}
			}
		]);
	});

	it.each([
		['42501', 403, 'You do not have access to configure the Critical Tasks library'],
		['P0002', 404, ICT_TASK_UNAVAILABLE_MESSAGE],
		['40001', 409, ICT_TASK_ORDER_CHANGED_MESSAGE],
		['PT409', 409, ICT_TASK_ORDER_CHANGED_MESSAGE],
		['40P01', 409, ICT_TASK_ORDER_CHANGED_MESSAGE],
		['55P03', 409, ICT_TASK_ORDER_CHANGED_MESSAGE],
		['22023', 400, 'Invalid task order'],
		['22P02', 400, 'Invalid task order'],
		['22003', 400, 'Invalid task order']
	])('answers a rolled back %s as a %i', async (code, status, message) => {
		const { port } = orderRpc(() =>
			Response.json({ code, message: 'synthetic', details: null, hint: null }, { status: 500 })
		);
		await expect(port.reorder(changes)).rejects.toMatchObject({ status, message });
	});

	it('reports a lost, unreadable or mismatched reply as unconfirmed without another request', async () => {
		for (const reply of [
			() => Promise.reject(new TypeError('fetch failed')),
			() => new Response('<html>Bad gateway</html>', { status: 502 }),
			() => Response.json([savedRow('task-a', 3)]),
			() => Response.json([savedRow('task-a', 3), savedRow('task-b', 2)]),
			() => Response.json([savedRow('task-a', 3), savedRow('task-b', 2), savedRow('task-c', 5)]),
			() => Response.json([savedRow('task-a', 2), savedRow('task-b', 3)]),
			() => Response.json([savedRow('task-a', 3), savedRow('task-c', 2)])
		]) {
			const { calls, port } = orderRpc(reply);
			const failure = await port.reorder(changes).catch((error: unknown) => error);
			expect(isUnconfirmedWrite(failure)).toBe(true);
			expect(failure).toMatchObject({ status: 503, message: CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE });
			expect(calls).toHaveLength(1);
		}
	});

	it('keeps any other database failure internal', async () => {
		const { port } = orderRpc(() => Response.json({ code: 'XX000', message: 'internal failure' }, { status: 500 }));
		const failure = await port.reorder(changes).catch((error: unknown) => error);
		expect(failure).toMatchObject({ message: 'internal failure' });
		expect(failure).not.toHaveProperty('status');
	});
});

describe('Critical Tasks library paging', () => {
	it('returns each import candidate once when physical order shifts between pages', async () => {
		const ids = pagedIds(1001, 'task');
		const client = createShiftingPostgrestClient({
			ict_tasks: ids.map((id, index) => ({ ...saved, id, task_code: `RESP-${index}`, sort_order: index }))
		});
		const candidates = await createSupabaseCriticalTaskLibraryPersistence(client, 'org-a').listImportCandidates();
		expect(candidates.map((task) => task.id).toSorted()).toEqual(ids);
	});
});
