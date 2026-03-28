import { fail } from '$lib/server/core/errors';
import { DailyAssignmentEntity } from '$lib/server/entities/dailyAssignment';
import type { WritePorts } from '$lib/server/core/ports';

const entity = DailyAssignmentEntity;
const AUDIT_RESOURCE = 'daily_assignment';

export interface ReplaceInput {
	date: string;
	records: Array<{ assignmentTypeId: string; assigneeId: string }>;
}

export async function replaceDailyAssignments(ctx: WritePorts, input: ReplaceInput): Promise<unknown[]> {
	ctx.auth.requireEdit('calendar');

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) fail(403, 'Organization is in read-only mode');

	const { date, records } = input;

	// Enforce group scope on all assignee personnel IDs
	const assigneeIds = records.map((r) => r.assigneeId);
	if (assigneeIds.length > 0) {
		await ctx.auth.requireGroupAccessBatch(assigneeIds);
	}

	// Delete all existing assignments for this date
	await ctx.store.deleteWhere(entity.table, ctx.auth.orgId, { date });

	// Insert new batch
	const rows = records.map((r) => entity.toDbInsert({ date, ...r }, ctx.auth.orgId));
	const inserted = await ctx.store.insertMany<Record<string, unknown>>(entity.table, ctx.auth.orgId, rows);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.replaced`,
		resourceType: AUDIT_RESOURCE,
		details: { date, count: records.length }
	});

	return inserted.map((row) => entity.fromDb(row));
}

export async function createDailyAssignment(ctx: WritePorts, input: Record<string, unknown>): Promise<unknown> {
	ctx.auth.requireEdit('calendar');

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) fail(403, 'Organization is in read-only mode');

	const validated = entity.createSchema.parse(input) as Record<string, unknown>;
	const assigneeId = validated.assigneeId as string;

	await ctx.auth.requireGroupAccess(assigneeId);

	const dbData = entity.toDbInsert(validated, ctx.auth.orgId);
	const row = await ctx.store.insert<Record<string, unknown>>(entity.table, ctx.auth.orgId, dbData);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.created`,
		resourceType: AUDIT_RESOURCE,
		resourceId: row.id as string | undefined
	});

	return entity.fromDb(row);
}

export async function updateDailyAssignment(ctx: WritePorts, input: Record<string, unknown>): Promise<unknown> {
	ctx.auth.requireEdit('calendar');

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) fail(403, 'Organization is in read-only mode');

	const validated = entity.updateSchema.parse(input) as Record<string, unknown>;
	const { id } = validated as { id: string };
	const assigneeId = validated.assigneeId as string | undefined;

	if (assigneeId) {
		await ctx.auth.requireGroupAccess(assigneeId);
	}

	const dbData = entity.toDbUpdate(validated);
	const row = await ctx.store.update<Record<string, unknown>>(entity.table, ctx.auth.orgId, id, dbData);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.updated`,
		resourceType: AUDIT_RESOURCE,
		resourceId: id
	});

	return entity.fromDb(row);
}

export async function deleteDailyAssignment(ctx: WritePorts, id: string): Promise<void> {
	ctx.auth.requireEdit('calendar');

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) fail(403, 'Organization is in read-only mode');

	await ctx.store.delete(entity.table, ctx.auth.orgId, id);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.deleted`,
		resourceType: AUDIT_RESOURCE,
		resourceId: id
	});
}

export async function clearDailyAssignment(
	ctx: WritePorts,
	input: { date: string; assignmentTypeId: string }
): Promise<void> {
	ctx.auth.requireEdit('calendar');

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) fail(403, 'Organization is in read-only mode');

	await ctx.store.deleteWhere(entity.table, ctx.auth.orgId, {
		date: input.date,
		assignment_type_id: input.assignmentTypeId
	});

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.cleared`,
		resourceType: AUDIT_RESOURCE,
		details: { date: input.date, assignmentTypeId: input.assignmentTypeId }
	});
}
