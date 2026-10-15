import { describe, expect, it } from 'vitest';
import { createInMemoryCriticalTaskLibraryPersistence } from '$features/critical-tasks/server/inMemoryCriticalTaskLibrary.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { _postConfig } from './+server';

describe('ICT task order JSON handler', () => {
	it('moves both tasks through one command and refuses the same move from a stale view', async () => {
		const ctx = createTestContext({ criticalTaskLibraryFactory: createInMemoryCriticalTaskLibraryPersistence });
		ctx.rawStore.seed('ict_tasks', [
			{ id: 'task-a', organization_id: ctx.auth.orgId, task_code: 'A', title: 'A', sort_order: 0, archived_at: null },
			{ id: 'task-b', organization_id: ctx.auth.orgId, task_code: 'B', title: 'B', sort_order: 1, archived_at: null }
		]);
		const move = {
			changes: [
				{ id: 'task-b', expectedSortOrder: 1, sortOrder: 0 },
				{ id: 'task-a', expectedSortOrder: 0, sortOrder: 1 }
			]
		};

		const saved = (await handleUseCaseRequest(_postConfig, ctx, move, () => ctx)) as Array<{
			id: string;
			sortOrder: number;
		}>;
		await expect(handleUseCaseRequest(_postConfig, ctx, move, () => ctx)).rejects.toMatchObject({ status: 409 });

		expect(saved.map(({ id, sortOrder }) => [id, sortOrder])).toEqual([
			['task-b', 0],
			['task-a', 1]
		]);
		expect(
			(await ctx.rawStore.findMany<{ id: string; sort_order: number }>('ict_tasks', ctx.auth.orgId)).map((row) => [
				row.id,
				row.sort_order
			])
		).toEqual([
			['task-a', 1],
			['task-b', 0]
		]);
		expect(ctx.auditPort.events.map((event) => [event.action, event.resourceId])).toEqual([
			['ict_task.reordered', 'task-b'],
			['ict_task.reordered', 'task-a']
		]);
	});
});
