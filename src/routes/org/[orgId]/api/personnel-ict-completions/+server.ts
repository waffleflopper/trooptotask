import { fail } from '$lib/server/core/errors';
import type { UseCaseContext } from '$lib/server/core/ports';
import { PersonnelIctCompletionEntity } from '$lib/server/entities/personnelIctCompletion';
import { entityHandlers, handle } from '$lib/server/adapters/httpAdapter';

interface IctTaskRow {
	id: string;
	archived_at: string | null;
}

interface PersonnelRow {
	id: string;
	archived_at: string | null;
}

interface PersonnelIctCompletionRow {
	id: string;
	ict_task_id: string;
	personnel_id: string;
}

async function findExistingCompletion(
	ctx: UseCaseContext,
	completionId: string
): Promise<PersonnelIctCompletionRow | null> {
	return (
		(await ctx.store.findOne<PersonnelIctCompletionRow>('personnel_ict_completions', ctx.auth.orgId, {
			id: completionId
		})) ?? null
	);
}

const handlers = entityHandlers(PersonnelIctCompletionEntity);
const createConfig = handlers._configs.POST!;
const updateConfig = handlers._configs.PUT!;
const deleteConfig = handlers._configs.DELETE!;

async function requireActivePersonnel(ctx: UseCaseContext, personnelId: string) {
	const person = await ctx.store.findOne<PersonnelRow>('personnel', ctx.auth.orgId, { id: personnelId });
	if (!person) {
		fail(400, 'Personnel record not found');
	}
	if (person.archived_at) {
		fail(400, 'Archived personnel cannot receive new completion entries');
	}
}

async function requireActiveIctTask(ctx: UseCaseContext, taskId: string) {
	const task = await ctx.store.findOne<IctTaskRow>('ict_tasks', ctx.auth.orgId, { id: taskId });
	if (!task) {
		fail(400, 'Critical task not found');
	}
	if (task.archived_at) {
		fail(400, 'Archived critical tasks cannot receive new completion entries');
	}
}

async function requireEditableCompletionHistory(
	ctx: UseCaseContext,
	completionId: string
): Promise<PersonnelIctCompletionRow | null> {
	const existing = await findExistingCompletion(ctx, completionId);
	if (!existing) return null;

	const person = await ctx.store.findOne<PersonnelRow>('personnel', ctx.auth.orgId, { id: existing.personnel_id });
	if (person?.archived_at) {
		fail(400, 'Archived personnel completion history cannot be edited');
	}

	const task = await ctx.store.findOne<IctTaskRow>('ict_tasks', ctx.auth.orgId, { id: existing.ict_task_id });
	if (task?.archived_at) {
		fail(400, 'Archived critical task history cannot be edited');
	}

	return existing;
}

async function requireWritableCompletionTargets(ctx: UseCaseContext, input: Record<string, unknown>) {
	const id = input.id;
	if (typeof id === 'string') {
		await requireEditableCompletionHistory(ctx, id);
	}

	if (typeof input.personnelId === 'string') {
		await requireActivePersonnel(ctx, input.personnelId);
	}
	if (typeof input.ictTaskId === 'string') {
		await requireActiveIctTask(ctx, input.ictTaskId);
	}
}

async function requireDeletableCompletionHistory(ctx: UseCaseContext, completionId: string) {
	const existing = await findExistingCompletion(ctx, completionId);
	if (!existing) return;

	const person = await ctx.store.findOne<PersonnelRow>('personnel', ctx.auth.orgId, { id: existing.personnel_id });
	if (person?.archived_at) {
		fail(400, 'Archived personnel completion history cannot be deleted');
	}

	const task = await ctx.store.findOne<IctTaskRow>('ict_tasks', ctx.auth.orgId, { id: existing.ict_task_id });
	if (task?.archived_at) {
		fail(400, 'Archived critical task history cannot be deleted');
	}
}

export const _postConfig = {
	...createConfig,
	fn: async (ctx: UseCaseContext, input: Record<string, unknown>) => {
		const personnelId = input.personnelId;
		if (typeof personnelId !== 'string') {
			fail(400, 'personnelId is required');
		}
		const ictTaskId = input.ictTaskId;
		if (typeof ictTaskId !== 'string') {
			fail(400, 'ictTaskId is required');
		}
		await requireActivePersonnel(ctx, personnelId);
		await requireActiveIctTask(ctx, ictTaskId);
		return createConfig.fn(ctx, input);
	}
};

export const _putConfig = {
	...updateConfig,
	fn: async (ctx: UseCaseContext, input: Record<string, unknown>) => {
		await requireWritableCompletionTargets(ctx, input);
		return updateConfig.fn(ctx, input);
	}
};

export const _deleteConfig = {
	...deleteConfig,
	fn: async (ctx: UseCaseContext, input: Record<string, unknown>) => {
		const id = input.id;
		if (typeof id === 'string') {
			await requireDeletableCompletionHistory(ctx, id);
		}
		return deleteConfig.fn(ctx, input);
	}
};

export const POST = handle(_postConfig);
export const PUT = handle(_putConfig);
export const DELETE = handle(_deleteConfig);
