import { describe, expect, it } from 'vitest';
import { createTestContext } from './criticalTasksPersistence.test-support.server';
import { createInMemoryCriticalTasksReadModelAdapter } from './inMemoryCriticalTasksReadModel.server';

describe('synthetic latest completion composition', () => {
	it('consumes the owned ledger and retains active scope, latest dates and optional filters', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [
			{ id: 'person-a', organization_id: 'test-org', archived_at: null },
			{ id: 'person-archived', organization_id: 'test-org', archived_at: '2026-09-01' },
			{ id: 'person-foreign', organization_id: 'other-org', archived_at: null }
		]);
		ctx.store.seed('ict_tasks', [
			{ id: 'task-a', organization_id: 'test-org', task_code: 'A', archived_at: null },
			{ id: 'task-b', organization_id: 'test-org', task_code: 'B', archived_at: null },
			{ id: 'task-archived', organization_id: 'test-org', task_code: 'C', archived_at: '2026-09-01' }
		]);
		const saved = {
			organization_id: 'test-org',
			personnel_id: 'person-a',
			ict_task_id: 'task-a',
			completed_at: '2026-04-01',
			validation_method: 'Lecture',
			validated_by: null,
			notes: 'Older capture',
			logged_by: null,
			created_at: '2026-04-01T00:00:00.123456Z'
		};
		ctx.store.seed('personnel_ict_completions', [
			{ ...saved, id: 'older' },
			{ ...saved, id: 'latest', completed_at: '2026-06-01', notes: 'Latest capture' },
			{ ...saved, id: 'other-task', ict_task_id: 'task-b' },
			{ ...saved, id: 'archived-person', personnel_id: 'person-archived' },
			{ ...saved, id: 'archived-task', ict_task_id: 'task-archived' },
			{ ...saved, id: 'foreign', organization_id: 'other-org', personnel_id: 'person-foreign' }
		]);
		const model = createInMemoryCriticalTasksReadModelAdapter(
			{
				findMany<T>(...args: Parameters<typeof ctx.store.findMany>) {
					if (args[0] !== 'personnel') throw new Error('Synthetic latest borrowed generic completion access');
					return ctx.store.findMany<T>(...args);
				}
			},
			ctx.criticalTaskLibrary,
			ctx.criticalTaskCompletions
		);
		expect(await model.findLatestCompletions('test-org', { taskIds: ['task-a', 'task-a'] })).toEqual([
			{
				id: 'latest',
				personnelId: 'person-a',
				ictTaskId: 'task-a',
				completedAt: '2026-06-01',
				validationMethod: 'Lecture',
				validatedBy: null,
				notes: 'Latest capture',
				loggedBy: null,
				createdAt: '2026-04-01T00:00:00.123456Z'
			}
		]);
		expect((await model.findLatestCompletions('test-org')).map((row) => row.id).sort()).toEqual([
			'latest',
			'other-task'
		]);
		expect(await model.findLatestCompletions('test-org', { personnelIds: ['missing'] })).toEqual([]);
		expect(await model.findLatestCompletions('test-org', { taskIds: [] })).toEqual([]);
	});
});
