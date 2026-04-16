import { fail } from '$lib/server/core/errors';
import type { UseCaseContext } from '$lib/server/core/ports';
import { PersonnelIctCompletionEntity } from '$lib/server/entities/personnelIctCompletion';
import { entityHandlers, handle } from '$lib/server/adapters/httpAdapter';

interface IctTaskRow {
	id: string;
	archived_at: string | null;
}

interface PersonnelIctCompletionRow {
	id: string;
	ict_task_id: string;
}

const handlers = entityHandlers(PersonnelIctCompletionEntity);
const createConfig = handlers._configs.POST!;
const updateConfig = handlers._configs.PUT!;

async function requireActiveIctTask(ctx: UseCaseContext, taskId: string) {
	const task = await ctx.store.findOne<IctTaskRow>('ict_tasks', ctx.auth.orgId, { id: taskId });
	if (!task) {
		fail(400, 'Critical task not found');
	}
	if (task.archived_at) {
		fail(400, 'Archived critical tasks cannot receive new completion entries');
	}
}

async function requireWritableIctTaskForUpdate(ctx: UseCaseContext, input: Record<string, unknown>) {
	if (typeof input.ictTaskId === 'string') {
		await requireActiveIctTask(ctx, input.ictTaskId);
		return;
	}

	const id = input.id;
	if (typeof id !== 'string') return;

	const existing = await ctx.store.findOne<PersonnelIctCompletionRow>('personnel_ict_completions', ctx.auth.orgId, {
		id
	});
	if (!existing) return;

	await requireActiveIctTask(ctx, existing.ict_task_id);
}

export const _postConfig = {
	...createConfig,
	fn: async (ctx: UseCaseContext, input: Record<string, unknown>) => {
		const ictTaskId = input.ictTaskId;
		if (typeof ictTaskId !== 'string') {
			fail(400, 'ictTaskId is required');
		}
		await requireActiveIctTask(ctx, ictTaskId);
		return createConfig.fn(ctx, input);
	}
};

export const _putConfig = {
	...updateConfig,
	fn: async (ctx: UseCaseContext, input: Record<string, unknown>) => {
		await requireWritableIctTaskForUpdate(ctx, input);
		return updateConfig.fn(ctx, input);
	}
};

export const POST = handle(_postConfig);
export const PUT = handle(_putConfig);
export const DELETE = handlers.DELETE;
