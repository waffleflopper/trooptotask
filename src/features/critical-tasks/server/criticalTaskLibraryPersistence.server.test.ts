import { createClient } from '@supabase/supabase-js';
import { setImmediate } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { createSupabaseCriticalTaskLibraryPersistence } from './criticalTaskLibraryPersistence.server';
import { importIctTasksBatch } from './ictTasksBatch.server';
import { createWritePortsContext } from './criticalTasksPersistence.test-support.server';

type Row = Record<string, unknown>;

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
		peak: 0
	};
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
				} else if (request.method === 'POST') {
					if (Array.isArray(body) && state.rejectBulk)
						return Response.json({ message: 'Bulk write rejected' }, { status: 400 });
					const inputs = (Array.isArray(body) ? body : [body]) as Row[];
					if (inputs.some((entry) => state.rejectCodes.has(String(entry.task_code))))
						return Response.json({ message: 'Task row rejected' }, { status: 400 });
					affected = inputs.map((entry, index) => ({
						id: `saved-${rows.length + index + 1}`,
						created_at: '2026-10-06T12:00:00.123456Z',
						...entry
					}));
					rows.push(...affected);
				} else if (request.method === 'PATCH') {
					for (const row of affected) Object.assign(row, body);
				} else throw new Error('Unexpected task method');
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
		expect(
			await library.createMany([
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
			])
		).toEqual([
			{
				id: 'saved-1',
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
				id: 'saved-2',
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
			id: 'saved-3',
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
			id: 'saved-3',
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

	it.each([null, {}, { id: 17 }, [], { id: '' }])('rejects malformed creation acknowledgment %j', async (data) => {
		const { library, state } = provider();
		state.acknowledgment = { data };
		await expect(library.create({ taskCode: 'NEW', title: 'New' })).rejects.toThrow('invalid acknowledgment');
	});

	it('rejects wrong-ID update acknowledgments and malformed batch acknowledgments', async () => {
		const { library, state } = provider([saved]);
		state.acknowledgment = { data: { ...saved, id: 'wrong-id' } };
		await expect(library.update('active-a', { title: 'Changed' })).rejects.toThrow('invalid acknowledgment');
		await expect(library.createMany([{ taskCode: 'NEW', title: 'New' }])).rejects.toThrow('invalid acknowledgment');
		state.acknowledgment = { data: [{}] };
		await expect(library.createMany([{ taskCode: 'NEW', title: 'New' }])).rejects.toThrow('invalid acknowledgment');
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
			['saved-2', 'PASS', 'Kept task']
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
			['saved-2', 'PASS', null]
		]);
		expect(ctx.audit.events).toMatchObject([
			{ action: 'ict_task.bulk_imported', details: { inserted: 1, updated: 0, restored: 1, errors: 1 } }
		]);
	});
});
