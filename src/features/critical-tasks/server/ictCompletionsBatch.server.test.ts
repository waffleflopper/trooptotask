import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createWritePortsContext } from './criticalTasksPersistence.test-support.server';
import { createSupabaseCriticalTaskCompletionPersistence } from './criticalTaskCompletionPersistence.server';
import { importIctCompletionsBatch } from './ictCompletionsBatch.server';

type Context = ReturnType<typeof createWritePortsContext>;

function person(id: string, overrides: Record<string, unknown> = {}) {
	return {
		id,
		organization_id: 'test-org',
		rank: 'SPC',
		first_name: 'Synthetic',
		last_name: id,
		mos: '68W',
		clinic_role: 'Medic',
		group_id: 'group-alpha',
		archived_at: null,
		...overrides
	};
}

function task(id: string, overrides: Record<string, unknown> = {}) {
	return {
		id,
		organization_id: 'test-org',
		task_code: id.toUpperCase(),
		title: `Task ${id}`,
		description: null,
		mos: [],
		expiration_months: 12,
		sort_order: 1,
		archived_at: null,
		created_at: '2026-04-01T00:00:00Z',
		...overrides
	};
}

function completion(id: string, personnelId: string, ictTaskId: string, completedAt: string) {
	return {
		id,
		organization_id: 'test-org',
		personnel_id: personnelId,
		ict_task_id: ictTaskId,
		completed_at: completedAt,
		validation_method: 'Lecture',
		validated_by: 'MSG Example',
		notes: 'Saved note',
		logged_by: 'user-1',
		created_at: `${completedAt}T12:00:00Z`
	};
}

async function storedCompletions(ctx: Context) {
	const rows = await ctx.store.findMany<Record<string, unknown>>('personnel_ict_completions', 'test-org');
	return rows
		.map((row) => ({
			key: `${row.personnel_id}|${row.ict_task_id}|${row.completed_at}`,
			method: row.validation_method,
			validatedBy: row.validated_by,
			notes: row.notes,
			loggedBy: row.logged_by
		}))
		.sort((left, right) => left.key.localeCompare(right.key));
}

describe('importIctCompletionsBatch', () => {
	it('reports an older saved completion re-imported with its saved fields as unchanged without writing', async () => {
		const ctx = createWritePortsContext();
		ctx.store.seed('personnel', [person('person-a')]);
		ctx.store.seed('ict_tasks', [task('task-a')]);
		ctx.store.seed('personnel_ict_completions', [
			completion('saved-january', 'person-a', 'task-a', '2026-01-01'),
			completion('saved-march', 'person-a', 'task-a', '2026-03-01')
		]);
		const update = vi.spyOn(ctx.criticalTaskCompletions, 'update');

		const reply = await importIctCompletionsBatch(ctx, {
			records: [
				{
					personnelId: 'person-a',
					ictTaskId: 'task-a',
					completedAt: '2026-01-01',
					validationMethod: 'Lecture',
					validatedBy: 'MSG Example',
					notes: 'Saved note'
				}
			]
		});

		expect(reply.results).toEqual([{ kind: 'unchanged' }]);
		expect(update).not.toHaveBeenCalled();
	});

	it('reports an older saved completion without optional fields as unchanged and preserves both dates', async () => {
		const ctx = createWritePortsContext();
		ctx.store.seed('personnel', [person('person-a')]);
		ctx.store.seed('ict_tasks', [task('task-a')]);
		ctx.store.seed('personnel_ict_completions', [
			completion('saved-january', 'person-a', 'task-a', '2026-01-01'),
			completion('saved-march', 'person-a', 'task-a', '2026-03-01')
		]);
		const update = vi.spyOn(ctx.criticalTaskCompletions, 'update');

		const reply = await importIctCompletionsBatch(ctx, {
			records: [{ personnelId: 'person-a', ictTaskId: 'task-a', completedAt: '2026-01-01' }]
		});

		expect(reply.results).toEqual([{ kind: 'unchanged' }]);
		expect(update).not.toHaveBeenCalled();
		expect(await storedCompletions(ctx)).toEqual([
			{
				key: 'person-a|task-a|2026-01-01',
				method: 'Lecture',
				validatedBy: 'MSG Example',
				notes: 'Saved note',
				loggedBy: 'user-1'
			},
			{
				key: 'person-a|task-a|2026-03-01',
				method: 'Lecture',
				validatedBy: 'MSG Example',
				notes: 'Saved note',
				loggedBy: 'user-1'
			}
		]);
		expect(ctx.audit.events).toEqual([expect.objectContaining({ details: { inserted: 0, updated: 0, failed: 0 } })]);
	});

	it.each(['people', 'tasks'])(
		'imports 500 distinct %s through a URL-limited provider without duplicating same-date history',
		async (dimension) => {
			const ctx = createWritePortsContext();
			const id = (kind: number, index: number) =>
				`${String(kind).padStart(8, '0')}-0000-4000-8000-${String(index).padStart(12, '0')}`;
			const people = Array.from({ length: dimension === 'people' ? 500 : 1 }, (_, index) => person(id(1, index)));
			const tasks = Array.from({ length: dimension === 'tasks' ? 500 : 1 }, (_, index) =>
				task(id(2, index), { task_code: `TASK${index}` })
			);
			const records = Array.from({ length: 500 }, (_, index) => ({
				personnelId: people[dimension === 'people' ? index : 0].id,
				ictTaskId: tasks[dimension === 'tasks' ? index : 0].id,
				completedAt: '2026-04-02',
				notes: `Checked row ${index}`
			}));
			const existing = Array.from({ length: 250 }, (_, index) =>
				completion(
					id(3, index),
					people[dimension === 'people' ? index * 2 : 0].id,
					tasks[dimension === 'tasks' ? index * 2 : 0].id,
					'2026-04-02'
				)
			);
			ctx.store.seed('personnel', people);
			ctx.store.seed('ict_tasks', tasks);
			ctx.store.seed('personnel_ict_completions', existing);
			const client = createClient('http://provider.invalid', 'synthetic-key', {
				auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
				global: {
					fetch: async (input) => {
						const url = new URL(String(input));
						if (url.href.length > 8192)
							return new Response(JSON.stringify({ message: 'URI too long' }), { status: 414 });
						const ids = (column: string) => url.searchParams.get(column)?.slice(4, -1).split(',') ?? [];
						return new Response(
							JSON.stringify(
								existing.filter(
									(row) =>
										ids('personnel_id').includes(row.personnel_id) && ids('ict_task_id').includes(row.ict_task_id)
								)
							),
							{ headers: { 'Content-Type': 'application/json' } }
						);
					}
				}
			});
			ctx.criticalTaskCompletions.listImportHistory = createSupabaseCriticalTaskCompletionPersistence(
				client,
				ctx.auth.orgId
			).listImportHistory;

			const reply = await importIctCompletionsBatch(ctx, { records });

			const kinds = reply.results.map((result) => result.kind);
			expect(kinds.filter((kind) => kind === 'added')).toHaveLength(250);
			expect(kinds.filter((kind) => kind === 'updated')).toHaveLength(250);
			const stored = await storedCompletions(ctx);
			expect(stored).toHaveLength(500);
			expect(stored.map((row) => row.notes).sort()).toEqual(records.map((row) => row.notes).sort());
		}
	);

	it('does not write or report success when required task history is unavailable', async () => {
		const ctx = createWritePortsContext();
		ctx.store.seed('personnel', [person('person-a')]);
		ctx.store.seed('ict_tasks', [task('task-a')]);
		vi.spyOn(ctx.criticalTaskCompletions, 'listImportHistory').mockRejectedValue(new Error('History lookup failed'));

		await expect(
			importIctCompletionsBatch(ctx, {
				records: [{ personnelId: 'person-a', ictTaskId: 'task-a', completedAt: '2026-04-02' }]
			})
		).rejects.toThrow('History lookup failed');
		expect(await storedCompletions(ctx)).toEqual([]);
		expect(ctx.audit.events).toEqual([]);
	});

	it('adds a new date, updates a same-date match with only the fields sent and never sets who logged it', async () => {
		const ctx = createWritePortsContext();
		ctx.store.seed('personnel', [person('person-a'), person('person-b')]);
		ctx.store.seed('ict_tasks', [task('task-a')]);
		ctx.store.seed('personnel_ict_completions', [completion('saved-1', 'person-a', 'task-a', '2026-03-01')]);

		const reply = await importIctCompletionsBatch(ctx, {
			records: [
				{ personnelId: 'person-a', ictTaskId: 'task-a', completedAt: '2026-03-01', notes: 'Updated note' },
				{ personnelId: 'person-b', ictTaskId: 'task-a', completedAt: '2026-04-15', loggedBy: 'forged' } as never
			]
		});

		expect(reply.results.map((result) => result.kind)).toEqual(['updated', 'added']);
		expect(await storedCompletions(ctx)).toEqual([
			{
				key: 'person-a|task-a|2026-03-01',
				method: 'Lecture',
				validatedBy: 'MSG Example',
				notes: 'Updated note',
				loggedBy: 'user-1'
			},
			expect.objectContaining({ key: 'person-b|task-a|2026-04-15', method: 'Other', validatedBy: null, notes: null })
		]);
		expect((await storedCompletions(ctx))[1].loggedBy).not.toBe('forged');
		expect(ctx.audit.events).toEqual([
			expect.objectContaining({
				action: 'personnel_ict_completion.bulk_imported',
				details: { inserted: 1, updated: 1, failed: 0 }
			})
		]);
	});

	it('fails rows for unknown or archived people and tasks and a repeated completion, and saves the rest', async () => {
		const ctx = createWritePortsContext();
		ctx.store.seed('personnel', [person('person-a'), person('person-gone', { archived_at: '2026-01-01T00:00:00Z' })]);
		ctx.store.seed('ict_tasks', [task('task-a'), task('task-old', { archived_at: '2026-01-01T00:00:00Z' })]);
		const row = (personnelId: string, ictTaskId: string) => ({ personnelId, ictTaskId, completedAt: '2026-04-15' });

		const reply = await importIctCompletionsBatch(ctx, {
			records: [
				row('person-a', 'task-a'),
				row('person-a', 'task-a'),
				row('person-missing', 'task-a'),
				row('person-gone', 'task-a'),
				row('person-a', 'task-missing'),
				row('person-a', 'task-old')
			]
		});

		expect(reply.results.slice(1)).toEqual([
			{ kind: 'failed', message: 'This completion appears more than once in this import.' },
			{ kind: 'failed', message: 'This person is not on a roster you can record completions for.' },
			{ kind: 'failed', message: 'This person is archived.' },
			{ kind: 'failed', message: 'This task is not in the task library.' },
			{ kind: 'failed', message: 'TASK-OLD is archived. Restore it in the task library first.' }
		]);
		expect((await storedCompletions(ctx)).map((stored) => stored.key)).toEqual(['person-a|task-a|2026-04-15']);
	});

	it('imports for a Critical Tasks-only Group operator without a request-store Personnel read', async () => {
		const ctx = createWritePortsContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'groups', groupIds: ['group-alpha'] },
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'operate',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		ctx.store.seed('personnel', [person('person-alpha'), person('person-bravo', { group_id: 'group-bravo' })]);
		ctx.store.seed('ict_tasks', [task('task-a')]);
		const requestFindMany = ctx.store.findMany.bind(ctx.store);
		vi.spyOn(ctx.store, 'findMany').mockImplementation((...args) => {
			if (args[0] === 'personnel') throw new Error('Personnel SELECT denied for this request');
			return requestFindMany(...args);
		});

		const reply = await importIctCompletionsBatch(ctx, {
			records: [
				{ personnelId: 'person-alpha', ictTaskId: 'task-a', completedAt: '2026-04-15' },
				{ personnelId: 'person-bravo', ictTaskId: 'task-a', completedAt: '2026-04-15' }
			]
		});

		expect(reply.results).toEqual([
			expect.objectContaining({ kind: 'added' }),
			{ kind: 'failed', message: 'This person is not on a roster you can record completions for.' }
		]);
		expect((await storedCompletions(ctx)).map((stored) => stored.key)).toEqual(['person-alpha|task-a|2026-04-15']);
	});

	it('keeps successful rows and fails the exact rows that cannot be saved when the bulk insert falls back', async () => {
		const ctx = createWritePortsContext();
		ctx.store.seed('personnel', [person('person-allowed'), person('person-rejected')]);
		ctx.store.seed('ict_tasks', [task('task-a')]);
		vi.spyOn(ctx.criticalTaskCompletions, 'createMany').mockRejectedValueOnce(new Error('bulk insert unavailable'));
		const create = ctx.criticalTaskCompletions.create.bind(ctx.criticalTaskCompletions);
		vi.spyOn(ctx.criticalTaskCompletions, 'create').mockImplementation((input) => {
			if (input.personnelId === 'person-rejected') throw new Error('row rejected');
			return create(input);
		});

		const reply = await importIctCompletionsBatch(ctx, {
			records: [
				{ personnelId: 'person-allowed', ictTaskId: 'task-a', completedAt: '2026-04-15' },
				{ personnelId: 'person-rejected', ictTaskId: 'task-a', completedAt: '2026-04-15' }
			]
		});

		expect(reply.results).toEqual([
			expect.objectContaining({ kind: 'added', record: expect.objectContaining({ personnelId: 'person-allowed' }) }),
			{ kind: 'failed', message: 'This completion could not be saved.' }
		]);
		expect((await storedCompletions(ctx)).map((stored) => stored.key)).toEqual(['person-allowed|task-a|2026-04-15']);
		expect(ctx.audit.events).toEqual([expect.objectContaining({ details: { inserted: 1, updated: 0, failed: 1 } })]);
	});
});
