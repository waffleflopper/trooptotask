import { setImmediate } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE } from '../contracts';
import { createSupabaseCriticalTaskCompletionPersistence } from './criticalTaskCompletionPersistence.server';
import { createWritePortsContext } from './criticalTasksPersistence.test-support.server';
import { importIctCompletionsBatch } from './ictCompletionsBatch.server';
import { createShiftingPostgrestClient, pagedIds } from '$lib/test-support/shiftingPostgrest';

type Row = Record<string, unknown>;
function provider(initial: Row[] = []) {
	const rows = structuredClone(initial);
	const state = {
		requests: [] as Array<{ url: URL; method: string; body: unknown }>,
		failOffset: -1,
		failTask: '',
		rejectMethod: '',
		rejectBulk: false,
		rejectPersonnel: '',
		bulkAcknowledgment: undefined as Row[] | undefined,
		hold: false,
		held: [] as Array<() => void>,
		inFlight: 0,
		peak: 0,
		writes: 0,
		loseReply: null as { write: number; as: 'transport' | 'unavailable' } | null,
		failReadsAfterLostReply: false,
		replyLost: false,
		ackWithout: '',
		readbackWithout: ''
	};
	const without = (row: Row, field: string) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== field));
	const uniqueDatedCompletion = (candidates: Row[]) =>
		new Set(
			candidates.map((row) => `${row.organization_id}:${row.personnel_id}:${row.ict_task_id}:${row.completed_at}`)
		).size === candidates.length;
	const duplicate = (constraint: string) =>
		Response.json(
			{ code: '23505', message: `duplicate key value violates unique constraint "${constraint}"` },
			{ status: 409 }
		);
	const client = createClient('http://completion-ledger.invalid', 'ordinary-request-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				const body: unknown = ['GET', 'DELETE'].includes(request.method) ? null : await request.json();
				state.requests.push({ url, method: request.method, body });
				if (
					state.requests.length > 150 ||
					url.origin !== 'http://completion-ledger.invalid' ||
					url.pathname !== '/rest/v1/personnel_ict_completions'
				)
					throw new Error('Unexpected completion provider operation');
				if (
					request.headers.get('authorization') !== 'Bearer ordinary-request-key' ||
					request.headers.get('apikey') !== 'ordinary-request-key'
				)
					throw new Error('Completion provider changed supplied authority');
				if (url.href.length > 8192) return Response.json({ message: 'URI too long' }, { status: 414 });
				state.inFlight++;
				state.peak = Math.max(state.peak, state.inFlight);
				if (state.hold) await new Promise<void>((resolve) => state.held.push(resolve));
				state.inFlight--;
				const offset = Number(url.searchParams.get('offset') ?? 0);
				if (request.method !== 'GET') state.writes++;
				if (request.method === 'GET' && state.failReadsAfterLostReply && state.replyLost)
					return Response.json(
						{ message: 'Completion provider unavailable' },
						{ status: 503, headers: { 'Retry-After': '0' } }
					);
				if (state.rejectMethod === request.method)
					return Response.json({ code: '23505', message: 'Completion write rejected' }, { status: 400 });
				if (
					request.method === 'GET' &&
					(state.failOffset === offset ||
						(state.failTask && url.searchParams.get('ict_task_id')?.includes(state.failTask)))
				)
					return Response.json({ message: 'Required completion history unavailable' }, { status: 403 });
				let affected = rows.filter((row) => {
					for (const [column, filter] of url.searchParams) {
						if (['select', 'order', 'offset', 'limit', 'columns'].includes(column)) continue;
						if (filter.startsWith('eq.')) {
							if (String(row[column]) !== filter.slice(3)) return false;
						} else if (filter.startsWith('in.(')) {
							if (!filter.slice(4, -1).split(',').includes(String(row[column]))) return false;
						} else throw new Error('Unexpected completion predicate');
					}
					return true;
				});
				if (request.method === 'GET') {
					const order = url.searchParams.get('order');
					if (order)
						affected.sort((a, b) => {
							for (const term of order.split(',')) {
								const [column, direction] = term.split('.');
								const comparison = String(a[column]).localeCompare(String(b[column]));
								if (comparison) return direction === 'desc' ? -comparison : comparison;
							}
							return 0;
						});
					affected = affected.slice(offset, offset + Number(url.searchParams.get('limit') ?? 1000));
					if (state.replyLost && state.readbackWithout)
						affected = affected.map((row) => without(row, state.readbackWithout));
				} else if (request.method === 'POST') {
					if (Array.isArray(body) && state.rejectBulk)
						return Response.json({ message: 'Bulk completion write rejected' }, { status: 400 });
					const inputs = (Array.isArray(body) ? body : [body]) as Row[];
					if (inputs.some((row) => row.personnel_id === state.rejectPersonnel))
						return Response.json({ message: 'Completion row rejected' }, { status: 400 });
					const created = inputs.map((row, index) => ({
						id: `saved-${rows.length + index + 1}`,
						logged_by: 'ordinary-user',
						created_at: '2026-10-06T12:00:00.123456Z',
						...row
					}));
					if (new Set([...rows, ...created].map((row) => row.id)).size !== rows.length + created.length)
						return duplicate('personnel_ict_completions_pkey');
					if (!uniqueDatedCompletion([...rows, ...created]))
						return duplicate('personnel_ict_completions_org_person_task_date_key');
					affected = created;
					rows.push(...affected);
					if (Array.isArray(body) && state.bulkAcknowledgment !== undefined) affected = state.bulkAcknowledgment;
					if (state.ackWithout) affected = affected.map((row) => without(row, state.ackWithout));
				} else if (request.method === 'PATCH') {
					if (!uniqueDatedCompletion(rows.map((row) => (affected.includes(row) ? { ...row, ...(body as Row) } : row))))
						return duplicate('personnel_ict_completions_org_person_task_date_key');
					for (const row of affected) Object.assign(row, body);
					if (state.ackWithout) affected = affected.map((row) => without(row, state.ackWithout));
				} else if (request.method === 'DELETE') {
					for (const row of affected) rows.splice(rows.indexOf(row), 1);
					return new Response(null, { status: 204 });
				} else throw new Error('Unexpected completion method');
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
					select && select !== '*'
						? Object.fromEntries(select.split(',').map((column) => [column.trim(), row[column.trim()]]))
						: row
				);
				if (request.method !== 'GET' && !request.headers.get('prefer')?.includes('return=representation'))
					return new Response(null, { status: 204 });
				if (request.headers.get('accept') === 'application/vnd.pgrst.object+json') {
					if (projected.length !== 1)
						return Response.json({ code: 'PGRST116', message: 'Expected one completion' }, { status: 406 });
					return Response.json(projected[0]);
				}
				return Response.json(projected);
			}
		}
	});
	return { rows, state, ledger: createSupabaseCriticalTaskCompletionPersistence(client, 'org-a') };
}

const saved: Row = {
	id: 'capture-a',
	organization_id: 'org-a',
	personnel_id: 'person-a',
	ict_task_id: 'task-a',
	completed_at: '2026-04-02',
	validation_method: 'Demonstration',
	validated_by: 'SFC Smith',
	notes: 'Retained capture',
	logged_by: 'saved-user',
	created_at: '2026-04-02T12:00:00.654321Z',
	updated_at: '2026-10-01T00:00:00Z',
	extra_saved_field: 'private'
};
const expected = {
	id: 'capture-a',
	personnelId: 'person-a',
	ictTaskId: 'task-a',
	completedAt: '2026-04-02',
	validationMethod: 'Demonstration',
	validatedBy: 'SFC Smith',
	notes: 'Retained capture',
	loggedBy: 'saved-user',
	createdAt: '2026-04-02T12:00:00.654321Z'
};
const fields = new Set([
	'id',
	'personnel_id',
	'ict_task_id',
	'completed_at',
	'validation_method',
	'validated_by',
	'notes',
	'logged_by',
	'created_at'
]);
const input = {
	personnelId: 'person-a',
	ictTaskId: 'task-a',
	completedAt: '2026-04-03',
	validationMethod: 'Lecture' as const
};

function assertBoundFilters(requests: Array<{ url: URL }>) {
	for (const { url } of requests)
		for (const column of ['personnel_id', 'ict_task_id']) {
			const filter = url.searchParams.get(column);
			if (filter?.startsWith('in.(')) expect(filter.slice(4, -1).split(',').length).toBeLessThanOrEqual(50);
		}
}

describe('owned Critical Tasks completion provider', () => {
	it('preserves ordered dated history, id-ordered readiness, explicit DTOs and ordinary authority', async () => {
		const { ledger, state } = provider([
			saved,
			{ ...saved, id: 'capture-older', completed_at: '2026-03-01', validated_by: null, notes: null, logged_by: null },
			{ ...saved, id: 'capture-0', ict_task_id: 'archived-task', completed_at: '2026-04-02' },
			{ ...saved, id: 'foreign-b', organization_id: 'org-b' },
			{ ...saved, id: 'other-person', personnel_id: 'person-b' }
		]);
		expect(await ledger.listHistory('person-a')).toEqual([
			{ ...expected, id: 'capture-0', ictTaskId: 'archived-task' },
			expected,
			{ ...expected, id: 'capture-older', completedAt: '2026-03-01', validatedBy: null, notes: null, loggedBy: null }
		]);
		expect((await ledger.listReadinessHistory('person-a')).map((row) => row.id)).toEqual([
			'capture-0',
			'capture-a',
			'capture-older'
		]);
		expect(await ledger.listHistory('missing')).toEqual([]);
		for (const { url } of state.requests)
			expect(
				new Set(
					url.searchParams
						.get('select')
						?.split(',')
						.map((field) => field.trim())
				)
			).toEqual(fields);
	});

	it('completes all 1001 captures for every history consumer with retained tail values', async () => {
		const rows = Array.from({ length: 1001 }, (_, i) => ({
			...saved,
			id: `capture-${String(i).padStart(4, '0')}`,
			notes: i === 1000 ? 'Last saved history' : 'Earlier history',
			completed_at: new Date(Date.UTC(2026, 3, 2 - i)).toISOString().slice(0, 10)
		}));
		const { ledger } = provider([...rows, { ...saved, id: 'foreign-tail', organization_id: 'org-b' }]);
		for (const result of [
			await ledger.listHistory('person-a'),
			await ledger.listReadinessHistory('person-a'),
			await ledger.listReportHistory({ personnelIds: ['person-a'], taskIds: ['task-a'] }),
			await ledger.listImportHistory([{ personnelId: 'person-a', ictTaskId: 'task-a' }])
		]) {
			expect(result).toHaveLength(1001);
			expect(result[1000]).toEqual({
				...expected,
				id: 'capture-1000',
				notes: 'Last saved history',
				completedAt: '2023-07-07'
			});
		}
	});

	it.each([0, 1000])('rejects whole history when page %i fails', async (offset) => {
		const { ledger, state } = provider(Array.from({ length: 1001 }, (_, i) => ({ ...saved, id: `capture-${i}` })));
		state.failOffset = offset;
		await expect(ledger.listHistory('person-a')).rejects.toThrow('Required completion history unavailable');
		await expect(ledger.listReadinessHistory('person-a')).rejects.toThrow('Required completion history unavailable');
		await expect(ledger.listReportHistory({ personnelIds: ['person-a'], taskIds: ['task-a'] })).rejects.toThrow(
			'Required completion history unavailable'
		);
		await expect(ledger.listImportHistory([{ personnelId: 'person-a', ictTaskId: 'task-a' }])).rejects.toThrow(
			'Required completion history unavailable'
		);
	});

	it('bounds report dimensions and concurrent windows without dropping tails or admitting unrequested rows', async () => {
		const people = Array.from({ length: 101 }, (_, i) => `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
		const tasks = Array.from({ length: 101 }, (_, i) => `20000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
		const { ledger, state } = provider([
			{ ...saved, id: 'first', personnel_id: people[0], ict_task_id: tasks[0] },
			{ ...saved, id: 'last', personnel_id: people[100], ict_task_id: tasks[100] },
			{ ...saved, id: 'foreign', organization_id: 'org-b', personnel_id: people[100], ict_task_id: tasks[100] },
			saved
		]);
		expect(await ledger.listReportHistory({ personnelIds: [], taskIds: tasks })).toEqual([]);
		expect(await ledger.listReportHistory({ personnelIds: people, taskIds: [] })).toEqual([]);
		expect(state.requests).toEqual([]);
		state.hold = true;
		const pending = ledger.listReportHistory({ personnelIds: [...people, people[0]], taskIds: [...tasks, tasks[0]] });
		await setImmediate();
		state.hold = false;
		for (const release of state.held.splice(0)) release();
		expect(await pending).toEqual([
			{ ...expected, id: 'first', personnelId: people[0], ictTaskId: tasks[0] },
			{ ...expected, id: 'last', personnelId: people[100], ictTaskId: tasks[100] }
		]);
		expect(state.peak).toBeLessThanOrEqual(4);
		assertBoundFilters(state.requests);
		state.failTask = tasks[100];
		await expect(ledger.listReportHistory({ personnelIds: people, taskIds: tasks })).rejects.toThrow(
			'Required completion history unavailable'
		);
	});

	it('bounds 500 import pairs, keeps all dates and deduplicates overlapping stored IDs', async () => {
		const pairs = Array.from({ length: 500 }, (_, i) => ({
			personnelId: `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
			ictTaskId: `20000000-0000-4000-8000-${String(i).padStart(12, '0')}`
		}));
		pairs[50] = { personnelId: pairs[0].personnelId, ictTaskId: pairs[50].ictTaskId };
		pairs[51] = { personnelId: pairs[51].personnelId, ictTaskId: pairs[0].ictTaskId };
		const { ledger, state } = provider([
			{ ...saved, id: 'overlap', personnel_id: pairs[0].personnelId, ict_task_id: pairs[0].ictTaskId },
			{
				...saved,
				id: 'older',
				personnel_id: pairs[0].personnelId,
				ict_task_id: pairs[0].ictTaskId,
				completed_at: '2026-01-01'
			},
			{ ...saved, id: 'last', personnel_id: pairs[499].personnelId, ict_task_id: pairs[499].ictTaskId },
			{
				...saved,
				id: 'foreign',
				organization_id: 'org-b',
				personnel_id: pairs[499].personnelId,
				ict_task_id: pairs[499].ictTaskId
			},
			saved
		]);
		expect(await ledger.listImportHistory([])).toEqual([]);
		expect(state.requests).toEqual([]);
		state.hold = true;
		const pending = ledger.listImportHistory([...pairs, pairs[0]]);
		await setImmediate();
		state.hold = false;
		for (const release of state.held.splice(0)) release();
		const result = await pending;
		expect(state.peak).toBe(10);
		expect(result.map((row) => [row.id, row.completedAt])).toEqual([
			['older', '2026-01-01'],
			['overlap', '2026-04-02'],
			['last', '2026-04-02']
		]);
		assertBoundFilters(state.requests);
		state.failTask = pairs[499].ictTaskId;
		await expect(ledger.listImportHistory(pairs)).rejects.toThrow('Required completion history unavailable');
	});

	it('returns only typed references and conceals missing/foreign records', async () => {
		const { ledger, state } = provider([saved, { ...saved, id: 'foreign-b', organization_id: 'org-b' }]);
		expect(await ledger.findReference('capture-a')).toEqual({
			id: 'capture-a',
			personnelId: 'person-a',
			ictTaskId: 'task-a'
		});
		expect(await ledger.findReference('missing')).toBeNull();
		expect(await ledger.findReference('foreign-b')).toBeNull();
		for (const { url } of state.requests)
			expect(new Set(url.searchParams.get('select')?.split(','))).toEqual(
				new Set(['id', 'personnel_id', 'ict_task_id'])
			);
		state.failOffset = 0;
		await expect(ledger.findReference('capture-a')).rejects.toThrow('Required completion history unavailable');
	});

	it('persists nullable defaults and partial edits without accepting protected fields or touching another tenant', async () => {
		const { ledger, rows } = provider([saved, { ...saved, id: 'foreign-b', organization_id: 'org-b' }]);
		const protectedInput = {
			...input,
			id: 'spoofed',
			loggedBy: 'spoofed',
			createdAt: 'changed',
			organization_id: 'org-b'
		};
		const created = await ledger.create(protectedInput);
		expect(created).toEqual({
			id: expect.any(String),
			personnelId: 'person-a',
			ictTaskId: 'task-a',
			completedAt: '2026-04-03',
			validationMethod: 'Lecture',
			validatedBy: null,
			notes: null,
			loggedBy: 'ordinary-user',
			createdAt: '2026-10-06T12:00:00.123456Z'
		});
		expect(created.id).not.toBe('spoofed');
		expect(rows[2]).toEqual({
			id: created.id,
			organization_id: 'org-a',
			personnel_id: 'person-a',
			ict_task_id: 'task-a',
			completed_at: '2026-04-03',
			validation_method: 'Lecture',
			validated_by: null,
			notes: null,
			logged_by: 'ordinary-user',
			created_at: '2026-10-06T12:00:00.123456Z'
		});
		const patch = {
			notes: null,
			validatedBy: null,
			loggedBy: 'spoofed',
			createdAt: 'changed',
			personnel_id: 'spoofed'
		};
		expect(await ledger.update('capture-a', patch)).toEqual({ ...expected, notes: null, validatedBy: null });
		await expect(ledger.update('foreign-b', { notes: 'Changed' })).rejects.toThrow('Expected one completion');
		await expect(ledger.update('missing', { notes: 'Changed' })).rejects.toThrow('Expected one completion');
		await ledger.delete('foreign-b');
		await ledger.delete('missing');
		expect(rows[1]).toEqual({ ...saved, id: 'foreign-b', organization_id: 'org-b' });
		await ledger.delete('capture-a');
		expect(rows.map((row) => row.id)).toEqual(['foreign-b', created.id]);
	});

	it.each(['create', 'createMany', 'update', 'delete'] as const)(
		'preserves plain %s provider failures without effects',
		async (operation) => {
			const { ledger, rows, state } = provider([saved]);
			state.rejectMethod = operation === 'update' ? 'PATCH' : operation === 'delete' ? 'DELETE' : 'POST';
			const pending =
				operation === 'create'
					? ledger.create(input)
					: operation === 'createMany'
						? ledger.createMany([input])
						: operation === 'update'
							? ledger.update('capture-a', { notes: null })
							: ledger.delete('capture-a');
			await expect(pending).rejects.toThrow('Completion write rejected');
			await expect(pending).rejects.not.toHaveProperty('status');
			expect(rows).toEqual([saved]);
		}
	);

	it('returns acknowledged bulk rows without inventing cardinality retries', async () => {
		const { ledger, rows, state } = provider();
		expect(await ledger.createMany([])).toEqual([]);
		expect(state.requests).toEqual([]);
		const created = await ledger.createMany([
			input,
			{ ...input, completedAt: '2026-04-04', validatedBy: 'SFC Jones', notes: 'Second date' }
		]);
		expect(created).toEqual([
			{
				id: rows[0].id,
				personnelId: 'person-a',
				ictTaskId: 'task-a',
				completedAt: '2026-04-03',
				validationMethod: 'Lecture',
				validatedBy: null,
				notes: null,
				loggedBy: 'ordinary-user',
				createdAt: '2026-10-06T12:00:00.123456Z'
			},
			{
				id: rows[1].id,
				personnelId: 'person-a',
				ictTaskId: 'task-a',
				completedAt: '2026-04-04',
				validationMethod: 'Lecture',
				validatedBy: 'SFC Jones',
				notes: 'Second date',
				loggedBy: 'ordinary-user',
				createdAt: '2026-10-06T12:00:00.123456Z'
			}
		]);
		expect(state.requests.map((request) => request.method)).toEqual(['POST']);
		state.bulkAcknowledgment = [];
		const confirmed = await ledger.createMany([{ ...input, completedAt: '2026-04-05' }]);
		expect(confirmed.map((row) => [row.id, row.completedAt])).toEqual([[rows[2].id, '2026-04-05']]);
		expect(rows.map((row) => row.completed_at)).toEqual(['2026-04-03', '2026-04-04', '2026-04-05']);
		expect(state.requests.map((request) => request.method)).toEqual(['POST', 'POST', 'GET']);
	});

	it('retains actual dated update and partial row outcomes after a rejected bulk insert', async () => {
		const { ledger, rows, state } = provider([saved]);
		state.rejectBulk = true;
		state.rejectPersonnel = 'person-rejected';
		const ctx = createWritePortsContext({ auth: { orgId: 'org-a' } });
		ctx.store.seed('personnel', [
			{
				id: 'person-a',
				organization_id: 'org-a',
				first_name: 'Amy',
				last_name: 'Able',
				rank: 'SGT',
				group_id: 'group-a',
				archived_at: null
			},
			{
				id: 'person-new',
				organization_id: 'org-a',
				first_name: 'Ben',
				last_name: 'Baker',
				rank: 'SPC',
				group_id: 'group-a',
				archived_at: null
			},
			{
				id: 'person-rejected',
				organization_id: 'org-a',
				first_name: 'Cal',
				last_name: 'Charlie',
				rank: 'SPC',
				group_id: 'group-a',
				archived_at: null
			}
		]);
		ctx.store.seed('ict_tasks', [
			{ id: 'task-a', organization_id: 'org-a', task_code: 'RESP', title: 'Ventilator', mos: [], archived_at: null }
		]);
		const record = (personnelId: string, completedAt: string, notes: string) => ({
			personnelId,
			ictTaskId: 'task-a',
			completedAt,
			validationMethod: 'Lecture' as const,
			notes
		});
		const reply = await importIctCompletionsBatch(
			{ ...ctx, criticalTaskCompletions: ledger },
			{
				records: [
					record('person-a', '2026-04-02', 'Updated same date'),
					record('person-new', '2026-04-03', 'Kept row'),
					record('person-rejected', '2026-04-03', 'Rejected row')
				]
			}
		);
		expect(reply.results).toEqual([
			{
				kind: 'updated',
				record: { ...expected, validationMethod: 'Lecture', notes: 'Updated same date' }
			},
			{
				kind: 'added',
				record: {
					id: rows[1].id,
					personnelId: 'person-new',
					ictTaskId: 'task-a',
					completedAt: '2026-04-03',
					validationMethod: 'Lecture',
					validatedBy: null,
					notes: 'Kept row',
					loggedBy: 'ordinary-user',
					createdAt: '2026-10-06T12:00:00.123456Z'
				}
			},
			{ kind: 'failed', message: 'This completion could not be saved.' }
		]);
		expect(rows.map((row) => [row.id, row.personnel_id, row.completed_at, row.notes])).toEqual([
			['capture-a', 'person-a', '2026-04-02', 'Updated same date'],
			[expect.any(String), 'person-new', '2026-04-03', 'Kept row']
		]);
		expect(ctx.audit.events).toMatchObject([
			{ action: 'personnel_ict_completion.bulk_imported', details: { inserted: 1, updated: 1, failed: 1 } }
		]);
	});
	it.each([false, true])(
		'confirms an incomplete bulk acknowledgment by reading back the generated ids without retrying persisted effects (empty=%s)',
		async (empty) => {
			const { ledger, rows, state } = provider();
			state.bulkAcknowledgment = empty
				? []
				: [
						{
							id: 'saved-1',
							personnel_id: 'person-a',
							ict_task_id: 'task-a',
							completed_at: '2026-04-03',
							validation_method: 'Lecture',
							validated_by: null,
							notes: null,
							logged_by: 'ordinary-user',
							created_at: '2026-10-06T12:00:00.123456Z'
						}
					];
			const ctx = createWritePortsContext({ auth: { orgId: 'org-a' } });
			ctx.store.seed('personnel', [
				{
					id: 'person-a',
					organization_id: 'org-a',
					first_name: 'Amy',
					last_name: 'Able',
					rank: 'SGT',
					group_id: 'group-a',
					archived_at: null
				},
				{
					id: 'person-b',
					organization_id: 'org-a',
					first_name: 'Ben',
					last_name: 'Baker',
					rank: 'SPC',
					group_id: 'group-a',
					archived_at: null
				}
			]);
			ctx.store.seed('ict_tasks', [
				{ id: 'task-a', organization_id: 'org-a', task_code: 'RESP', title: 'Ventilator', mos: [], archived_at: null }
			]);
			const reply = await importIctCompletionsBatch(
				{ ...ctx, criticalTaskCompletions: ledger },
				{
					records: ['person-a', 'person-b'].map((personnelId) => ({
						personnelId,
						ictTaskId: 'task-a',
						completedAt: '2026-04-03',
						validationMethod: 'Lecture' as const
					}))
				}
			);
			expect(reply.results.map((result) => ('record' in result ? [result.kind, result.record.id] : result))).toEqual([
				['added', rows[0].id],
				['added', rows[1].id]
			]);
			expect(rows.map((row) => [row.personnel_id, row.completed_at])).toEqual([
				['person-a', '2026-04-03'],
				['person-b', '2026-04-03']
			]);
			expect(
				state.requests.filter((request) => request.method === 'POST').map((request) => Array.isArray(request.body))
			).toEqual([true]);
			expect(ctx.audit.events).toMatchObject([
				{
					action: 'personnel_ict_completion.bulk_imported',
					details: { inserted: 2, updated: 0, failed: 0 }
				}
			]);
		}
	);
});

describe('#1643 completion import recovery after a lost provider reply', () => {
	function importContext() {
		const ctx = createWritePortsContext({ auth: { orgId: 'org-a' } });
		ctx.store.seed('personnel', [
			{
				id: 'person-a',
				organization_id: 'org-a',
				first_name: 'Amy',
				last_name: 'Able',
				rank: 'SGT',
				group_id: 'group-a',
				archived_at: null
			},
			{
				id: 'person-b',
				organization_id: 'org-a',
				first_name: 'Ben',
				last_name: 'Baker',
				rank: 'SPC',
				group_id: 'group-a',
				archived_at: null
			}
		]);
		ctx.store.seed('ict_tasks', [
			{ id: 'task-a', organization_id: 'org-a', task_code: 'RESP', title: 'Ventilator', mos: [], archived_at: null }
		]);
		return ctx;
	}
	const row = (personnelId: string, notes: string) => ({
		personnelId,
		ictTaskId: 'task-a',
		completedAt: '2026-04-02',
		validationMethod: 'Lecture' as const,
		notes
	});

	it.each(['transport', 'unavailable'] as const)(
		'reports a committed bulk insert as created, with one dated row each, when its reply is lost (%s)',
		async (lost) => {
			const { ledger, rows, state } = provider();
			state.loseReply = { write: 1, as: lost };
			const ctx = importContext();
			const reply = await importIctCompletionsBatch(
				{ ...ctx, criticalTaskCompletions: ledger },
				{ records: [row('person-a', 'First'), row('person-b', 'Second')] }
			);
			expect(rows.map((saved) => [saved.personnel_id, saved.completed_at])).toEqual([
				['person-a', '2026-04-02'],
				['person-b', '2026-04-02']
			]);
			expect(
				reply.results.map((result) => ('record' in result ? [result.kind, result.record.personnelId] : result))
			).toEqual([
				['added', 'person-a'],
				['added', 'person-b']
			]);
			expect(state.requests.filter((request) => request.method === 'POST')).toHaveLength(1);
		}
	);

	it('reports an import row whose same-date update reply is lost as unconfirmed', async () => {
		const { ledger, rows, state } = provider([saved]);
		state.loseReply = { write: 1, as: 'transport' };
		const ctx = importContext();
		const reply = await importIctCompletionsBatch(
			{ ...ctx, criticalTaskCompletions: ledger },
			{ records: [row('person-a', 'Changed')] }
		);
		expect(reply.results).toEqual([{ kind: 'unconfirmed', message: CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE }]);
		expect(rows.map((saved) => [saved.id, saved.notes])).toEqual([['capture-a', 'Changed']]);
		expect(ctx.audit.events).toMatchObject([{ details: { inserted: 0, updated: 0, failed: 0 } }]);
	});

	it('returns a committed single completion whose reply is lost, and keeps a lost update unconfirmed', async () => {
		const { ledger, rows, state } = provider([saved]);
		state.loseReply = { write: 1, as: 'transport' };
		const created = await ledger.create({ ...input, completedAt: '2026-05-01' });
		expect(created).toMatchObject({ id: rows[1].id, completedAt: '2026-05-01' });
		state.loseReply = { write: 2, as: 'unavailable' };
		const failure = await ledger.update('capture-a', { notes: 'Changed' }).catch((error: unknown) => error);
		expect(failure).toMatchObject({
			status: 503,
			publicMessage: true,
			message: CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE
		});
		expect(rows.map((row) => [row.id, row.notes])).toEqual([
			['capture-a', 'Changed'],
			[created.id, null]
		]);
	});

	it('reads back generated ids when an acknowledgment carries them without the saved completion fields', async () => {
		const { ledger, rows, state } = provider();
		state.ackWithout = 'validation_method';
		const created = await ledger.create({ ...input, completedAt: '2026-05-01' });
		const createdMany = await ledger.createMany([
			{ ...input, completedAt: '2026-05-02' },
			{ ...input, completedAt: '2026-05-03' }
		]);
		expect([created, ...createdMany].map((completion) => [completion.id, completion.validationMethod])).toEqual(
			rows.map((row) => [row.id, row.validation_method])
		);
		expect(state.requests.filter((request) => request.method === 'POST')).toHaveLength(2);
	});

	it('leaves an update unconfirmed when its acknowledgment lacks saved completion fields', async () => {
		const { ledger, rows, state } = provider([saved]);
		state.ackWithout = 'validation_method';
		await expect(ledger.update('capture-a', { notes: 'Changed' })).rejects.toMatchObject({
			status: 503,
			message: CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE
		});
		expect(rows[0].notes).toBe('Changed');
		expect(state.requests.filter((request) => request.method === 'GET')).toHaveLength(0);
	});

	it('keeps rows unconfirmed when the read-back returns rows without the saved completion fields', async () => {
		const { ledger, rows, state } = provider();
		state.loseReply = { write: 1, as: 'transport' };
		state.readbackWithout = 'validation_method';
		await expect(
			ledger.createMany([
				{ ...input, completedAt: '2026-05-02' },
				{ ...input, completedAt: '2026-05-03' }
			])
		).rejects.toMatchObject({ status: 503, message: CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE });
		expect(rows).toHaveLength(2);
		expect(state.requests.filter((request) => request.method === 'POST')).toHaveLength(1);
	});

	it('reports a repeated person, task and date in one import as a duplicate in plain words', async () => {
		const { ledger, rows } = provider();
		const ctx = importContext();
		const reply = await importIctCompletionsBatch(
			{ ...ctx, criticalTaskCompletions: ledger },
			{ records: [row('person-a', 'First'), row('person-a', 'Again')] }
		);
		expect(
			reply.results.map((result) => {
				if (result.kind === 'failed') return result.message;
				if (result.kind === 'unchanged' || result.kind === 'unconfirmed') return result.kind;
				return result.record.notes;
			})
		).toEqual(['First', 'This completion appears more than once in this import.']);
		expect(rows.map((saved) => saved.notes)).toEqual(['First']);
	});
});

describe('Critical Tasks completion paging', () => {
	it('returns each readiness and import capture once when physical order shifts between pages', async () => {
		const ids = pagedIds(1001, 'capture');
		const client = createShiftingPostgrestClient({
			personnel_ict_completions: ids.map((id) => ({ ...saved, id }))
		});
		const ledger = createSupabaseCriticalTaskCompletionPersistence(client, 'org-a');
		for (const rows of [
			await ledger.listReadinessHistory('person-a'),
			await ledger.listImportHistory([{ personnelId: 'person-a', ictTaskId: 'task-a' }])
		])
			expect(rows.map((row) => row.id).toSorted()).toEqual(ids);
	});
});
