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

type Row = Record<string, unknown>;

const without = (row: Row, field: string) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== field));

function provider(initialRows: Row[] = []) {
	const rows = structuredClone(initialRows);
	const state = {
		requests: [] as Array<{ url: URL; method: string; body: unknown }>,
		reject: null as { method: string; code: string; message: string } | null,
		failOffset: null as number | null,
		failReference: null as string | null,
		rejectBulk: false,
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
					url.pathname !== '/rest/v1/ict_tasks'
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
				} else if (request.method === 'POST') {
					if (Array.isArray(body) && state.rejectBulk)
						return Response.json({ message: 'Bulk write rejected' }, { status: 400 });
					if (state.dropWrite === state.writes) throw new TypeError('fetch failed');
					const inputs = (Array.isArray(body) ? body : [body]) as Row[];
					if (inputs.some((entry) => state.rejectCodes.has(String(entry.task_code))))
						return Response.json({ message: 'Task row rejected' }, { status: 400 });
					const created = inputs.map((entry, index) => ({
						id: `saved-${rows.length + index + 1}`,
						created_at: '2026-10-06T12:00:00.123456Z',
						...entry
					}));
					if (new Set([...rows, ...created].map((row) => row.id)).size !== rows.length + created.length)
						return duplicate('ict_tasks_pkey');
					if (!uniqueTaskCode([...rows, ...created])) return duplicate('ict_tasks_organization_id_task_code_key');
					affected = created;
					rows.push(...affected);
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
		expect(state.requests[2].url.searchParams.has('order')).toBe(false);
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
		expect(candidates[1001]).toMatchObject({ id: 'archived-tail', archivedAt: '2026-09-01T00:00:00Z' });
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

	it('acknowledges every saved row in a successful bulk insert', async () => {
		const { library, rows } = provider();
		const bulk = await library.createMany([
			{
				taskCode: 'BULK-1',
				title: 'First',
				description: 'Notes',
				category: 'Airway',
				mos: ['68V'],
				expirationMonths: 6,
				sortOrder: 9,
				archivedAt: '2026-09-01T00:00:00Z'
			},
			{ taskCode: 'BULK-2', title: 'Second' }
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
		expect(bulk.map((task) => task.id)).toEqual(rows.map((row) => row.id));
		expect(rows.map((row) => row.organization_id)).toEqual(['org-a', 'org-a']);
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
		await expect(library.update('foreign-b', { title: 'Foreign changed' })).rejects.toThrow('Expected one task');
		expect(rows[1].title).toBe('Ventilator setup');
		const before = state.requests.length;
		expect(await library.createMany([])).toEqual([]);
		expect(state.requests).toHaveLength(before);
	});

	it.each(['create', 'createMany', 'update'] as const)(
		'rejects %s provider failure without a saved effect',
		async (operation) => {
			const { library, rows, state } = provider([saved]);
			state.reject = { method: operation === 'update' ? 'PATCH' : 'POST', code: '42501', message: 'Task write denied' };
			const pending =
				operation === 'create'
					? library.create({ taskCode: 'NEW', title: 'New' })
					: operation === 'createMany'
						? library.createMany([{ taskCode: 'NEW', title: 'New' }])
						: library.update('active-a', { title: 'Changed' });
			await expect(pending).rejects.toThrow('Task write denied');
			expect(rows).toEqual([saved]);
		}
	);

	it.each(['create', 'createMany', 'update'] as const)(
		'preserves the named task-code conflict for %s',
		async (operation) => {
			const { library, state } = provider([saved]);
			state.reject = {
				method: operation === 'update' ? 'PATCH' : 'POST',
				code: '23505',
				message: 'duplicate key violates unique constraint "ict_tasks_organization_id_task_code_key"'
			};
			const pending =
				operation === 'create'
					? library.create({ taskCode: 'RESP-200', title: 'Duplicate' })
					: operation === 'createMany'
						? library.createMany([{ taskCode: 'RESP-200', title: 'Duplicate' }])
						: library.update('active-a', { taskCode: 'RESP-200' });
			await expect(pending).rejects.toMatchObject({ status: 409 });
		}
	);

	it.each(['create', 'createMany', 'update'] as const)(
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
					: operation === 'createMany'
						? library.createMany([{ taskCode: 'NEW', title: 'New' }])
						: library.update('active-a', { title: 'Changed' });
			await expect(pending).rejects.toThrow('Unrelated uniqueness constraint');
			await expect(pending).rejects.not.toHaveProperty('status');
		}
	);

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
		state.acknowledgment = { data: [{ ...saved, id: 'wrong-id' }] };
		await expect(library.createMany([{ taskCode: 'NEW', title: 'New' }])).resolves.toMatchObject([{ taskCode: 'NEW' }]);
		state.acknowledgment = { data: [{}] };
		await expect(library.createMany([{ taskCode: 'NEW-2', title: 'New' }])).resolves.toMatchObject([
			{ taskCode: 'NEW-2' }
		]);
		state.acknowledgment = { data: [] };
		await expect(
			library.createMany([
				{ taskCode: 'NEW-3', title: 'New' },
				{ taskCode: 'NEW-4', title: 'New' }
			])
		).resolves.toMatchObject([{ taskCode: 'NEW-3' }, { taskCode: 'NEW-4' }]);
		expect(rows.map((row) => row.task_code)).toEqual(['RESP-200', 'NEW', 'NEW-2', 'NEW-3', 'NEW-4']);
	});

	it('reads back generated ids when an acknowledgment carries them without the saved task fields', async () => {
		const { library, rows, state } = provider();
		state.ackWithout = 'title';
		const created = await library.create({ taskCode: 'ONE', title: 'First' });
		const createdMany = await library.createMany([
			{ taskCode: 'TWO', title: 'Second' },
			{ taskCode: 'THREE', title: 'Third' }
		]);
		expect([created, ...createdMany].map((task) => [task.id, task.title])).toEqual(
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
		expect(state.requests.filter((request) => request.method === 'GET')).toHaveLength(0);
	});

	it('keeps rows unconfirmed when the read-back returns rows without the saved task fields', async () => {
		const { library, rows, state } = provider();
		state.loseReply = { write: 1, as: 'transport' };
		state.readbackWithout = 'title';
		await expect(
			library.createMany([
				{ taskCode: 'LOST-1', title: 'First' },
				{ taskCode: 'LOST-2', title: 'Second' }
			])
		).rejects.toSatisfy(isUnconfirmedWrite);
		expect(rows).toHaveLength(2);
		expect(state.requests.filter((request) => request.method === 'POST')).toHaveLength(1);
	});

	it('rejects an update without an acknowledged saved row', async () => {
		const { library, rows } = provider([saved]);
		await expect(library.update('missing', { title: 'Changed' })).rejects.toThrow('Expected one task');
		expect(rows).toEqual([saved]);
	});

	it('retains row success and errors after a rejected bulk write, with a restored task identity', async () => {
		const { library, rows, state } = provider([
			{ ...saved, id: 'restore-a', task_code: 'OLD', archived_at: '2026-09-01T00:00:00Z' }
		]);
		state.rejectBulk = true;
		state.rejectCodes.add('FAIL');
		const ctx = createWritePortsContext({ auth: { orgId: 'org-a' } });
		const result = await importIctTasksBatch(
			{ ...ctx, criticalTaskLibrary: library },
			{
				mode: 'upsert',
				records: [
					{ rowNumber: 2, values: { taskCode: 'PASS', title: 'Kept task' } },
					{ rowNumber: 3, values: { taskCode: 'FAIL', title: 'Rejected task' } },
					{ rowNumber: 4, values: { taskCode: 'OLD', title: 'Restored task' } }
				]
			}
		);
		expect(result.inserted.map((task) => [task.id, task.taskCode, task.title])).toEqual([
			[rows[1].id, 'PASS', 'Kept task']
		]);
		expect(result.updated).toEqual([]);
		expect(result.restored.map((task) => [task.id, task.title, task.archivedAt])).toEqual([
			['restore-a', 'Restored task', null]
		]);
		expect(result.errors).toEqual([
			{ rowNumber: 3, taskCode: 'FAIL', title: 'Rejected task', message: 'Task row rejected' }
		]);
		expect(rows.map((row) => [row.id, row.task_code, row.archived_at])).toEqual([
			['restore-a', 'OLD', null],
			[expect.any(String), 'PASS', null]
		]);
		expect(ctx.audit.events).toMatchObject([
			{ action: 'ict_task.bulk_imported', details: { inserted: 1, updated: 0, restored: 1, errors: 1, unconfirmed: 0 } }
		]);
	});
});

const lostRecords = [
	{ rowNumber: 2, values: { taskCode: 'LOST-1', title: 'First' } },
	{ rowNumber: 3, values: { taskCode: 'LOST-2', title: 'Second' } }
];

describe('#1643 task import recovery after a lost provider reply', () => {
	it.each(['transport', 'unavailable'] as const)(
		'reports a committed bulk insert as created when its reply is lost (%s)',
		async (lost) => {
			const { library, rows, state } = provider();
			state.loseReply = { write: 1, as: lost };
			const ctx = createWritePortsContext({ auth: { orgId: 'org-a' } });
			const result = await importIctTasksBatch(
				{ ...ctx, criticalTaskLibrary: library },
				{ mode: 'create-only', records: lostRecords }
			);
			expect({ inserted: result.inserted.map((task) => task.taskCode), errors: result.errors }).toEqual({
				inserted: ['LOST-1', 'LOST-2'],
				errors: []
			});
			expect(rows.map((row) => row.task_code)).toEqual(['LOST-1', 'LOST-2']);
			expect(state.requests.filter((request) => request.method === 'POST')).toHaveLength(1);
			expect(ctx.audit.events).toMatchObject([
				{
					action: 'ict_task.bulk_imported',
					details: { inserted: 2, updated: 0, restored: 0, errors: 0, unconfirmed: 0 }
				}
			]);
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

	it('keeps a committed fallback row created when its reply is lost after a genuine bulk rejection', async () => {
		const { library, rows, state } = provider();
		state.rejectBulk = true;
		state.loseReply = { write: 2, as: 'transport' };
		const ctx = createWritePortsContext({ auth: { orgId: 'org-a' } });
		const result = await importIctTasksBatch(
			{ ...ctx, criticalTaskLibrary: library },
			{ mode: 'create-only', records: lostRecords }
		);
		expect({ inserted: result.inserted.map((task) => task.taskCode), errors: result.errors }).toEqual({
			inserted: ['LOST-1', 'LOST-2'],
			errors: []
		});
		expect(rows.map((row) => row.task_code)).toEqual(['LOST-1', 'LOST-2']);
	});

	it('reports rows as unconfirmed, without blind per-row retries, when the insert reply and read-back both fail', async () => {
		const { library, rows, state } = provider();
		state.loseReply = { write: 1, as: 'transport' };
		state.failReadsAfterLostReply = true;
		const ctx = createWritePortsContext({ auth: { orgId: 'org-a' } });
		const result = await importIctTasksBatch(
			{ ...ctx, criticalTaskLibrary: library },
			{ mode: 'create-only', records: lostRecords }
		);
		expect({
			inserted: result.inserted,
			errors: result.errors,
			unconfirmed: result.unconfirmed.map((row) => row.rowNumber)
		}).toEqual({ inserted: [], errors: [], unconfirmed: [2, 3] });
		expect(rows.map((row) => row.task_code)).toEqual(['LOST-1', 'LOST-2']);
		expect(state.requests.filter((request) => request.method === 'POST')).toHaveLength(1);
	});

	it('does not resubmit rows as new tasks when the insert never committed and the read-back finds nothing', async () => {
		const { library, rows, state } = provider();
		state.dropWrite = 1;
		const ctx = createWritePortsContext({ auth: { orgId: 'org-a' } });
		const result = await importIctTasksBatch(
			{ ...ctx, criticalTaskLibrary: library },
			{ mode: 'create-only', records: lostRecords }
		);
		expect({
			inserted: result.inserted,
			errors: result.errors,
			unconfirmed: result.unconfirmed.map((row) => row.rowNumber)
		}).toEqual({ inserted: [], errors: [], unconfirmed: [2, 3] });
		expect(rows).toEqual([]);
		expect(state.requests.filter((request) => request.method === 'POST')).toHaveLength(1);
	});

	it('keeps every row unconfirmed when the read-back finds only some of the generated ids', async () => {
		const { library, rows, state } = provider();
		state.loseReply = { write: 1, as: 'transport' };
		state.readbackLimit = 1;
		const ctx = createWritePortsContext({ auth: { orgId: 'org-a' } });
		const result = await importIctTasksBatch(
			{ ...ctx, criticalTaskLibrary: library },
			{ mode: 'create-only', records: lostRecords }
		);
		expect({
			inserted: result.inserted,
			errors: result.errors,
			unconfirmed: result.unconfirmed.map((row) => row.rowNumber)
		}).toEqual({ inserted: [], errors: [], unconfirmed: [2, 3] });
		expect(rows.map((row) => row.task_code)).toEqual(['LOST-1', 'LOST-2']);
		expect(state.requests.filter((request) => request.method === 'POST')).toHaveLength(1);
	});

	it('reconciles a full 500-row insert with bounded read-back requests', async () => {
		const { library, rows, state } = provider();
		state.loseReply = { write: 1, as: 'transport' };
		const created = await library.createMany(
			Array.from({ length: 500 }, (_, index) => ({ taskCode: `BULK-${index}`, title: `Task ${index}` }))
		);
		expect(created.map((task) => task.taskCode)).toEqual(rows.map((row) => row.task_code));
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
		'reports an update whose reply is lost (%s) as unconfirmed, not failed',
		async (lost) => {
			const { library, rows, state } = provider([saved]);
			state.loseReply = { write: 1, as: lost };
			const ctx = createWritePortsContext({ auth: { orgId: 'org-a' } });
			const result = await importIctTasksBatch(
				{ ...ctx, criticalTaskLibrary: library },
				{ mode: 'upsert', records: [{ rowNumber: 2, values: { taskCode: 'RESP-200', title: 'Changed' } }] }
			);
			expect({
				updated: result.updated,
				errors: result.errors,
				unconfirmed: result.unconfirmed.map((row) => row.rowNumber)
			}).toEqual({ updated: [], errors: [], unconfirmed: [2] });
			expect(rows.map((row) => [row.task_code, row.title])).toEqual([['RESP-200', 'Changed']]);
		}
	);

	it('keeps a refused update as a failed row even though its requested content can match', async () => {
		const { library, rows, state } = provider([saved]);
		state.reject = { method: 'PATCH', code: '42501', message: 'Task update refused' };
		const ctx = createWritePortsContext({ auth: { orgId: 'org-a' } });
		const result = await importIctTasksBatch(
			{ ...ctx, criticalTaskLibrary: library },
			{ mode: 'upsert', records: [{ rowNumber: 2, values: { taskCode: 'RESP-200', title: 'Ventilator setup' } }] }
		);
		expect({
			updated: result.updated,
			errors: result.errors,
			unconfirmed: result.unconfirmed
		}).toEqual({
			updated: [],
			errors: [{ rowNumber: 2, taskCode: 'RESP-200', title: 'Ventilator setup', message: 'Task update refused' }],
			unconfirmed: []
		});
		expect(rows.map((row) => row.title)).toEqual(['Ventilator setup']);
	});
});

describe('task order command', () => {
	const ORG = '00000000-0000-4000-8000-0000000000a1';
	const changes = [
		{ id: 'task-b', expectedSortOrder: 3, sortOrder: 2 },
		{ id: 'task-a', expectedSortOrder: 2, sortOrder: 3 }
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

	it('sends every change in one Organization-bound call and returns the saved tasks', async () => {
		const { calls, port } = orderRpc(() => Response.json([savedRow('task-a', 3), savedRow('task-b', 2)]));

		await expect(port.reorder(changes)).resolves.toEqual([
			expect.objectContaining({ id: 'task-a', taskCode: 'TASK-A', sortOrder: 3 }),
			expect.objectContaining({ id: 'task-b', taskCode: 'TASK-B', sortOrder: 2 })
		]);
		expect(calls).toEqual([
			{
				path: '/rest/v1/rpc/reorder_ict_tasks',
				body: {
					p_organization_id: ORG,
					p_changes: [
						{ id: 'task-b', expected_sort_order: 3, sort_order: 2 },
						{ id: 'task-a', expected_sort_order: 2, sort_order: 3 }
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
