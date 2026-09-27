import { fail } from '$lib/server/core/errors';
import type { UseCaseContext } from '$lib/server/core/ports';
import { PersonnelIctCompletionEntity } from '$lib/server/entities/personnelIctCompletion';
import { entityHandlers, handle } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';

interface IctTaskRow {
	id: string;
	archived_at: string | null;
}

interface PersonnelIctCompletionRow {
	id: string;
	ict_task_id: string;
	personnel_id: string;
}

type CompletionPerson = Awaited<ReturnType<UseCaseContext['personnelCriticalTasksRoster']['findForCompletionWrite']>>;

type CompletionWriteContext = UseCaseContext & {
	completionWriteReferences?: {
		people: Map<string, Promise<CompletionPerson>>;
		completions: Map<string, Promise<PersonnelIctCompletionRow | null>>;
	};
};

function createCompletionWriteContext(ctx: UseCaseContext): CompletionWriteContext {
	return {
		...ctx,
		completionWriteReferences: { people: new Map(), completions: new Map() }
	};
}

async function findExistingCompletion(
	ctx: CompletionWriteContext,
	completionId: string
): Promise<PersonnelIctCompletionRow | null> {
	const completions = ctx.completionWriteReferences?.completions;
	let pending = completions?.get(completionId);
	if (!pending) {
		pending = ctx.store.findOne<PersonnelIctCompletionRow>('personnel_ict_completions', ctx.auth.orgId, {
			id: completionId
		});
		completions?.set(completionId, pending);
	}
	return pending;
}

async function findCompletionPerson(ctx: CompletionWriteContext, personnelId: string) {
	const people = ctx.completionWriteReferences?.people;
	let pending = people?.get(personnelId);
	if (!pending) {
		pending = ctx.personnelCriticalTasksRoster.findForCompletionWrite(ctx.auth, personnelId);
		people?.set(personnelId, pending);
	}
	return pending;
}

async function requireCompletionPersonScope(
	ctx: UseCaseContext,
	person: Awaited<ReturnType<typeof findCompletionPerson>>,
	completionId?: string
) {
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.criticalTasks.recordCompletion,
		policyResourceForGroup(person?.groupId),
		'personnel_ict_completion',
		completionId
	);
}

const handlers = entityHandlers(PersonnelIctCompletionEntity, {
	policyResourceForPersonnel: async (ctx, personnelId) =>
		policyResourceForGroup((await findCompletionPerson(ctx, personnelId))?.groupId),
	policyResourceForRecord: async (ctx, recordId) => {
		const completion = await findExistingCompletion(ctx, recordId);
		return policyResourceForGroup(
			completion ? (await findCompletionPerson(ctx, completion.personnel_id))?.groupId : null
		);
	}
});
const createConfig = handlers._configs.POST!;
const updateConfig = handlers._configs.PUT!;
const deleteConfig = handlers._configs.DELETE!;

async function requireActivePersonnel(ctx: UseCaseContext, personnelId: string, completionId?: string) {
	const person = await findCompletionPerson(ctx, personnelId);
	await requireCompletionPersonScope(ctx, person, completionId);
	if (!person) {
		fail(400, 'Personnel record not found');
	}
	if (person.archivedAt) {
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

	const person = await findCompletionPerson(ctx, existing.personnel_id);
	await requireCompletionPersonScope(ctx, person, existing.id);
	if (person?.archivedAt) {
		fail(400, 'Archived personnel completion history cannot be edited');
	}

	const task = await ctx.store.findOne<IctTaskRow>('ict_tasks', ctx.auth.orgId, { id: existing.ict_task_id });
	if (!task) {
		fail(400, 'Critical task not found');
	}
	if (task.archived_at) {
		fail(400, 'Archived critical task history cannot be edited');
	}
	if (!person) fail(400, 'Personnel record not found');

	return existing;
}

async function requireWritableCompletionTargets(ctx: UseCaseContext, input: Record<string, unknown>) {
	const id = input.id;
	if (typeof id === 'string') {
		await requireEditableCompletionHistory(ctx, id);
	}

	if (typeof input.personnelId === 'string') {
		await requireActivePersonnel(ctx, input.personnelId, typeof id === 'string' ? id : undefined);
	}
	if (typeof input.ictTaskId === 'string') {
		await requireActiveIctTask(ctx, input.ictTaskId);
	}
}

async function requireDeletableCompletionHistory(ctx: UseCaseContext, completionId: string) {
	const existing = await findExistingCompletion(ctx, completionId);
	if (!existing) return;

	const person = await findCompletionPerson(ctx, existing.personnel_id);
	await requireCompletionPersonScope(ctx, person, existing.id);
	if (person?.archivedAt) {
		fail(400, 'Archived personnel completion history cannot be deleted');
	}

	const task = await ctx.store.findOne<IctTaskRow>('ict_tasks', ctx.auth.orgId, { id: existing.ict_task_id });
	if (!task) {
		fail(400, 'Critical task not found');
	}
	if (task.archived_at) {
		fail(400, 'Archived critical task history cannot be deleted');
	}
	if (!person) fail(400, 'Personnel record not found');
}

export const _postConfig = {
	...createConfig,
	fn: async (ctx: UseCaseContext, input: Record<string, unknown>) => {
		const writeCtx = createCompletionWriteContext(ctx);
		const personnelId = input.personnelId;
		if (typeof personnelId !== 'string') {
			fail(400, 'personnelId is required');
		}
		const ictTaskId = input.ictTaskId;
		if (typeof ictTaskId !== 'string') {
			fail(400, 'ictTaskId is required');
		}
		await requireActivePersonnel(writeCtx, personnelId);
		await requireActiveIctTask(writeCtx, ictTaskId);
		return createConfig.fn(writeCtx, input);
	}
};

export const _putConfig = {
	...updateConfig,
	fn: async (ctx: UseCaseContext, input: Record<string, unknown>) => {
		const writeCtx = createCompletionWriteContext(ctx);
		await requireWritableCompletionTargets(writeCtx, input);
		return updateConfig.fn(writeCtx, input);
	}
};

export const _deleteConfig = {
	...deleteConfig,
	fn: async (ctx: UseCaseContext, input: Record<string, unknown>) => {
		const writeCtx = createCompletionWriteContext(ctx);
		const id = input.id;
		if (typeof id === 'string') {
			await requireDeletableCompletionHistory(writeCtx, id);
		}
		return deleteConfig.fn(writeCtx, input);
	}
};

export const POST = handle(_postConfig);
export const PUT = handle(_putConfig);
export const DELETE = handle(_deleteConfig);
