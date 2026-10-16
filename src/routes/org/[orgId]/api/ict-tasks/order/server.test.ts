import { describe, expect, it } from 'vitest';
import { createInMemoryCriticalTaskLibraryPersistence } from '$features/critical-tasks/server/inMemoryCriticalTaskLibrary.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { _postConfig } from './+server';

const TASK_A = '00000000-0000-4000-8000-000000002001';
const TASK_B = '00000000-0000-4000-8000-000000002002';
const TASK_C = '00000000-0000-4000-8000-000000002003';

describe('ICT task order JSON handler', () => {
	it('moves both tasks through one command and refuses the same move from a stale view', async () => {
		const ctx = createTestContext({ criticalTaskLibraryFactory: createInMemoryCriticalTaskLibraryPersistence });
		ctx.rawStore.seed('ict_tasks', [
			{ id: TASK_A, organization_id: ctx.auth.orgId, task_code: 'A', title: 'A', sort_order: 0, archived_at: null },
			{ id: TASK_B, organization_id: ctx.auth.orgId, task_code: 'B', title: 'B', sort_order: 1, archived_at: null },
			{ id: TASK_C, organization_id: ctx.auth.orgId, task_code: 'C', title: 'C', sort_order: 4, archived_at: null }
		]);
		const move = {
			changes: [
				{ id: TASK_B, expectedSortOrder: 1, sortOrder: 0 },
				{ id: TASK_A, expectedSortOrder: 0, sortOrder: 1 },
				{ id: TASK_C, expectedSortOrder: 4, sortOrder: 4 }
			]
		};

		const saved = (await handleUseCaseRequest(_postConfig, ctx, move, () => ctx)) as Array<{
			id: string;
			sortOrder: number;
		}>;
		await expect(handleUseCaseRequest(_postConfig, ctx, move, () => ctx)).rejects.toMatchObject({ status: 409 });

		expect(saved.map(({ id, sortOrder }) => [id, sortOrder])).toEqual([
			[TASK_B, 0],
			[TASK_A, 1],
			[TASK_C, 4]
		]);
		expect(
			(await ctx.rawStore.findMany<{ id: string; sort_order: number }>('ict_tasks', ctx.auth.orgId)).map((row) => [
				row.id,
				row.sort_order
			])
		).toEqual([
			[TASK_A, 1],
			[TASK_B, 0],
			[TASK_C, 4]
		]);
		expect(ctx.auditPort.events.map((event) => [event.action, event.resourceId])).toEqual([
			['ict_task.reordered', TASK_B],
			['ict_task.reordered', TASK_A]
		]);
	});
});
