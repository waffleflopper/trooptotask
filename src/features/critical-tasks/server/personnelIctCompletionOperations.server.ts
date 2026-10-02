import type { z } from 'zod';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { PersonnelIctCompletion } from '../contracts';
import { PersonnelIctCompletionEntity } from './personnelIctCompletionEntity.server';
import type { PersonnelIctCompletionWriteContext } from './personnelIctCompletionPorts.server';

const entity = PersonnelIctCompletionEntity;
const ACTION = POLICY_ACTION_CATALOG.criticalTasks.recordCompletion;
const AUDIT_RESOURCE = 'personnel_ict_completion';

interface IctTaskRow {
	id: string;
	archived_at: string | null;
}

interface CompletionReference {
	id: string;
	ict_task_id: string;
	personnel_id: string;
}

type CompletionPerson = Awaited<
	ReturnType<PersonnelIctCompletionWriteContext['personnelCriticalTasksRoster']['findForCompletionWrite']>
>;

interface CompletionWriteContext extends PersonnelIctCompletionWriteContext {
	readonly references: {
		people: Map<string, Promise<CompletionPerson>>;
		completions: Map<string, Promise<CompletionReference | null>>;
	};
}

function writeContext(ctx: PersonnelIctCompletionWriteContext): CompletionWriteContext {
	return {
		auth: ctx.auth,
		audit: ctx.audit,
		store: ctx.store,
		personnelCriticalTasksRoster: ctx.personnelCriticalTasksRoster,
		references: { people: new Map(), completions: new Map() }
	};
}

function fail(status: number, message: string): never {
	throw Object.assign(new Error(message), { status });
}

function parseOrFail<T>(schema: z.ZodType<T>, input: Record<string, unknown>): T {
	const result = schema.safeParse(input);
	if (!result.success) fail(400, result.error.issues.map((issue) => issue.message).join('; '));
	return result.data;
}

function findExistingCompletion(ctx: CompletionWriteContext, completionId: string) {
	let pending = ctx.references.completions.get(completionId);
	if (!pending) {
		pending = ctx.store.findOne<CompletionReference>(entity.table, ctx.auth.orgId, { id: completionId });
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
	const task = await ctx.store.findOne<IctTaskRow>('ict_tasks', ctx.auth.orgId, { id: taskId });
	if (!task) fail(400, 'Critical task not found');
	if (task.archived_at) fail(400, 'Archived critical tasks cannot receive new completion entries');
}

async function requireWritableCompletionHistory(
	ctx: CompletionWriteContext,
	completionId: string,
	operation: 'edited' | 'deleted'
) {
	const existing = await findExistingCompletion(ctx, completionId);
	if (!existing) return;

	const person = await findCompletionPerson(ctx, existing.personnel_id);
	await requireCompletionPersonScope(ctx, person, existing.id);
	if (person?.archivedAt) fail(400, `Archived personnel completion history cannot be ${operation}`);

	const task = await ctx.store.findOne<IctTaskRow>('ict_tasks', ctx.auth.orgId, { id: existing.ict_task_id });
	if (!task) fail(400, 'Critical task not found');
	if (task.archived_at) fail(400, `Archived critical task history cannot be ${operation}`);
	if (!person) fail(400, 'Personnel record not found');
}

async function requireRecordScope(ctx: CompletionWriteContext, id: string) {
	const existing = await findExistingCompletion(ctx, id);
	const person = existing ? await findCompletionPerson(ctx, existing.personnel_id) : null;
	await requireCompletionPersonScope(ctx, person, id);
}

export async function createPersonnelIctCompletion(
	ctx: PersonnelIctCompletionWriteContext,
	input: Record<string, unknown>
): Promise<PersonnelIctCompletion> {
	await requireFeaturePolicy(ctx, ACTION, { kind: 'unscoped' }, AUDIT_RESOURCE);
	const writeCtx = writeContext(ctx);
	const personnelId = input.personnelId;
	if (typeof personnelId !== 'string') fail(400, 'personnelId is required');
	const ictTaskId = input.ictTaskId;
	if (typeof ictTaskId !== 'string') fail(400, 'ictTaskId is required');
	await requireActivePersonnel(writeCtx, personnelId);
	await requireActiveIctTask(writeCtx, ictTaskId);

	const validated = parseOrFail(entity.createSchema, input);
	await requireCompletionPersonScope(writeCtx, await findCompletionPerson(writeCtx, personnelId));
	const row = await ctx.store.insert<Record<string, unknown>>(
		entity.table,
		ctx.auth.orgId,
		entity.toDbInsert(validated, ctx.auth.orgId),
		entity.select
	);
	ctx.audit.log({ action: `${AUDIT_RESOURCE}.created`, resourceType: AUDIT_RESOURCE, resourceId: row.id as string });
	return entity.fromDb(row);
}

export async function updatePersonnelIctCompletion(
	ctx: PersonnelIctCompletionWriteContext,
	input: Record<string, unknown>
): Promise<PersonnelIctCompletion> {
	await requireFeaturePolicy(ctx, ACTION, { kind: 'unscoped' }, AUDIT_RESOURCE);
	const writeCtx = writeContext(ctx);
	const id = input.id;
	if (typeof id === 'string') await requireWritableCompletionHistory(writeCtx, id, 'edited');
	if (typeof input.personnelId === 'string') {
		await requireActivePersonnel(writeCtx, input.personnelId, typeof id === 'string' ? id : undefined);
	}
	if (typeof input.ictTaskId === 'string') await requireActiveIctTask(writeCtx, input.ictTaskId);

	const validated = parseOrFail(entity.updateSchema, input);
	const completionId = (validated as { id: string }).id;
	await requireRecordScope(writeCtx, completionId);
	const row = await ctx.store.update<Record<string, unknown>>(
		entity.table,
		ctx.auth.orgId,
		completionId,
		entity.toDbUpdate(validated),
		entity.select
	);
	ctx.audit.log({ action: `${AUDIT_RESOURCE}.updated`, resourceType: AUDIT_RESOURCE, resourceId: completionId });
	return entity.fromDb(row);
}

export async function preparePersonnelIctCompletionDeletion(ctx: PersonnelIctCompletionWriteContext, id: unknown) {
	await requireFeaturePolicy(ctx, ACTION, { kind: 'unscoped' }, AUDIT_RESOURCE);
	const writeCtx = writeContext(ctx);
	if (typeof id === 'string') await requireWritableCompletionHistory(writeCtx, id, 'deleted');

	// The delivery route validates its query ID after the retained history guards.
	return async (): Promise<void> => {
		if (typeof id !== 'string') fail(400, 'Missing id');
		await requireRecordScope(writeCtx, id);
		await ctx.store.delete(entity.table, ctx.auth.orgId, id);
		ctx.audit.log({ action: `${AUDIT_RESOURCE}.deleted`, resourceType: AUDIT_RESOURCE, resourceId: id });
	};
}
