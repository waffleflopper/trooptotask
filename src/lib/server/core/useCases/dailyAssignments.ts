/**
 * Daily assignment use cases — create, update, delete, and replace assignments for a day.
 *
 * `replaceAssignments(ctx, input)` is the primary mutation: it atomically deletes all
 * assignments for a given date and re-inserts the provided list. This "replace the day"
 * pattern is how the calendar writes assignment blocks.
 *
 * For bulk operations across many dates, see `dailyAssignmentsBatch.ts`.
 */
import { fail } from '$lib/server/core/errors';
import { DailyAssignmentEntity } from '$lib/server/entities/dailyAssignment';
import type { WritePorts } from '$lib/server/core/ports';

const entity = DailyAssignmentEntity;
const AUDIT_RESOURCE = 'daily_assignment';

async function requireExistingAssignmentAccess(ctx: WritePorts, filters: Record<string, unknown>): Promise<void> {
	if (!ctx.auth.scopedGroupId) return;

	const existingRows = await ctx.store.findMany<Record<string, unknown>>(entity.table, ctx.auth.orgId, filters, {
		select: 'assignee_id'
	});
	const assigneeIds = [
		...new Set(existingRows.map((row) => row.assignee_id).filter((id): id is string => typeof id === 'string'))
	];

	if (assigneeIds.length > 0) {
		await ctx.auth.requireGroupAccessBatch(assigneeIds);
	}
}

async function requireExistingAssignmentAccessById(ctx: WritePorts, id: string): Promise<void> {
	if (!ctx.auth.scopedGroupId) return;

	const existingRow = await ctx.store.findOne<Record<string, unknown>>(
		entity.table,
		ctx.auth.orgId,
		{ id },
		'assignee_id'
	);
	const assigneeId = existingRow?.assignee_id;

	if (typeof assigneeId === 'string') {
		await ctx.auth.requireGroupAccess(assigneeId);
	}
}

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

	await requireExistingAssignmentAccess(ctx, { date });

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

	await requireExistingAssignmentAccessById(ctx, id);

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

	await requireExistingAssignmentAccessById(ctx, id);

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

	await requireExistingAssignmentAccess(ctx, {
		date: input.date,
		assignment_type_id: input.assignmentTypeId
	});

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
