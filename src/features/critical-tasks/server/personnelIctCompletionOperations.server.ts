import type { z } from 'zod';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { PersonnelIctCompletion, CriticalTaskCompletionReference } from '../contracts';
import { completionCreateSchema, completionUpdateSchema } from './personnelIctCompletionMapping.server';
import type { PersonnelIctCompletionWriteContext } from './personnelIctCompletionPorts.server';
import { fail } from '$lib/errors';

const ACTION = POLICY_ACTION_CATALOG.criticalTasks.recordCompletion;
const AUDIT_RESOURCE = 'personnel_ict_completion';

type CompletionPerson = Awaited<
	ReturnType<PersonnelIctCompletionWriteContext['personnelCriticalTasksRoster']['findForCompletionWrite']>
>;

interface CompletionWriteContext extends PersonnelIctCompletionWriteContext {
	readonly references: {
		people: Map<string, Promise<CompletionPerson>>;
		completions: Map<string, Promise<CriticalTaskCompletionReference | null>>;
	};
}

function writeContext(ctx: PersonnelIctCompletionWriteContext): CompletionWriteContext {
	return {
		auth: ctx.auth,
		audit: ctx.audit,
		criticalTaskCompletions: ctx.criticalTaskCompletions,
		criticalTaskLibrary: ctx.criticalTaskLibrary,
		personnelCriticalTasksRoster: ctx.personnelCriticalTasksRoster,
		references: { people: new Map(), completions: new Map() }
	};
}

function parseOrFail<T>(schema: z.ZodType<T>, input: Record<string, unknown>): T {
	const result = schema.safeParse(input);
	if (!result.success) fail(400, result.error.issues.map((issue) => issue.message).join('; '));
	return result.data;
}

function findExistingCompletion(ctx: CompletionWriteContext, completionId: string) {
	let pending = ctx.references.completions.get(completionId);
	if (!pending) {
		pending = ctx.criticalTaskCompletions.findReference(completionId);
		ctx.references.completions.set(completionId, pending);
	}
	return pending;
}

function findCompletionPerson(ctx: CompletionWriteContext, personnelId: string) {
	let pending = ctx.references.people.get(personnelId);
	if (!pending) {
		pending = ctx.personnelCriticalTasksRoster.findForCompletionWrite(ctx.auth, personnelId);
		ctx.references.people.set(personnelId, pending);
	}
	return pending;
}

function requireCompletionPersonScope(ctx: CompletionWriteContext, person: CompletionPerson, completionId?: string) {
	return requireFeaturePolicy(ctx, ACTION, policyResourceForGroup(person?.groupId), AUDIT_RESOURCE, completionId);
}

async function requireActivePersonnel(ctx: CompletionWriteContext, personnelId: string, completionId?: string) {
	const person = await findCompletionPerson(ctx, personnelId);
	await requireCompletionPersonScope(ctx, person, completionId);
	if (!person) fail(400, 'Personnel record not found');
	if (person.archivedAt) fail(400, 'Archived personnel cannot receive new completion entries');
}

async function requireActiveIctTask(ctx: CompletionWriteContext, taskId: string) {
	const task = await ctx.criticalTaskLibrary.findReference(taskId);
	if (!task) fail(400, 'Critical task not found');
	if (task.archivedAt) fail(400, 'Archived critical tasks cannot receive new completion entries');
}

async function requireWritableCompletionHistory(
	ctx: CompletionWriteContext,
	completionId: string,
	operation: 'edited' | 'deleted'
) {
	const existing = await findExistingCompletion(ctx, completionId);
	if (!existing) return;

	const person = await findCompletionPerson(ctx, existing.personnelId);
	await requireCompletionPersonScope(ctx, person, existing.id);
	if (person?.archivedAt) fail(400, `Archived personnel completion history cannot be ${operation}`);

	const task = await ctx.criticalTaskLibrary.findReference(existing.ictTaskId);
	if (!task) fail(400, 'Critical task not found');
	if (task.archivedAt) fail(400, `Archived critical task history cannot be ${operation}`);
	if (!person) fail(400, 'Personnel record not found');
}

async function requireRecordScope(ctx: CompletionWriteContext, id: string) {
	const existing = await findExistingCompletion(ctx, id);
	const person = existing ? await findCompletionPerson(ctx, existing.personnelId) : null;
	await requireCompletionPersonScope(ctx, person, id);
}

export async function createPersonnelIctCompletion(
	ctx: PersonnelIctCompletionWriteContext,
	input: Record<string, unknown>
): Promise<PersonnelIctCompletion> {
	await requireFeaturePolicy(ctx, ACTION, { kind: 'unscoped' }, AUDIT_RESOURCE);
	const writeCtx = writeContext(ctx);
	if (typeof input.personnelId !== 'string') fail(400, 'personnelId is required');
	if (typeof input.ictTaskId !== 'string') fail(400, 'ictTaskId is required');
	const validated = parseOrFail(completionCreateSchema, input);
	const { personnelId, ictTaskId } = validated;
	await requireActivePersonnel(writeCtx, personnelId);
	await requireActiveIctTask(writeCtx, ictTaskId);

	await requireCompletionPersonScope(writeCtx, await findCompletionPerson(writeCtx, personnelId));
	const row = await ctx.criticalTaskCompletions.create(validated);
	ctx.audit.log({ action: `${AUDIT_RESOURCE}.created`, resourceType: AUDIT_RESOURCE, resourceId: row.id });
	return row;
}

export async function updatePersonnelIctCompletion(
	ctx: PersonnelIctCompletionWriteContext,
	input: Record<string, unknown>
): Promise<PersonnelIctCompletion> {
	await requireFeaturePolicy(ctx, ACTION, { kind: 'unscoped' }, AUDIT_RESOURCE);
	const writeCtx = writeContext(ctx);
	const validated = parseOrFail(completionUpdateSchema, input);
	const completionId = validated.id;
	await requireWritableCompletionHistory(writeCtx, completionId, 'edited');
	if (validated.personnelId) await requireActivePersonnel(writeCtx, validated.personnelId, completionId);
	if (validated.ictTaskId) await requireActiveIctTask(writeCtx, validated.ictTaskId);

	await requireRecordScope(writeCtx, completionId);
	if (!(await findExistingCompletion(writeCtx, completionId))) fail(404, 'That completion is no longer available.');
	const row = await ctx.criticalTaskCompletions.update(completionId, validated);
	ctx.audit.log({ action: `${AUDIT_RESOURCE}.updated`, resourceType: AUDIT_RESOURCE, resourceId: completionId });
	return row;
}

export async function preparePersonnelIctCompletionDeletion(ctx: PersonnelIctCompletionWriteContext, id: unknown) {
	await requireFeaturePolicy(ctx, ACTION, { kind: 'unscoped' }, AUDIT_RESOURCE);
	const writeCtx = writeContext(ctx);
	if (typeof id === 'string') await requireWritableCompletionHistory(writeCtx, id, 'deleted');

	return async (): Promise<void> => {
		if (typeof id !== 'string') fail(400, 'Missing id');
		await requireRecordScope(writeCtx, id);
		await ctx.criticalTaskCompletions.delete(id);
		ctx.audit.log({ action: `${AUDIT_RESOURCE}.deleted`, resourceType: AUDIT_RESOURCE, resourceId: id });
	};
}
