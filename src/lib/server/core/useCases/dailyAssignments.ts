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
import { PersonnelEntity } from '$lib/server/entities/personnel';
import type { WritePorts } from '$lib/server/core/ports';
import { findDutyCoverageConflicts } from './dutyAvailability';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPersonnelPolicy, requireCalendarPolicy } from './calendarPolicy';

const entity = DailyAssignmentEntity;
const AUDIT_RESOURCE = 'daily_assignment';

type AssignmentTarget = 'personnel' | 'group';
type AssignmentPolicyRecord = { assignmentTypeId: string; assigneeId: string };

async function getAssignmentTargets(
	ctx: WritePorts,
	assignmentTypeIds: string[]
): Promise<Map<string, AssignmentTarget>> {
	const uniqueIds = [...new Set(assignmentTypeIds.filter((id) => typeof id === 'string' && id.length > 0))];
	const targets = new Map<string, AssignmentTarget>(uniqueIds.map((id) => [id, 'personnel']));

	if (uniqueIds.length === 0) {
		return targets;
	}

	const rows = await ctx.store.findMany<Record<string, unknown>>('assignment_types', ctx.auth.orgId, undefined, {
		inFilters: { id: uniqueIds },
		select: 'id, assign_to'
	});

	for (const row of rows) {
		if (typeof row.id !== 'string') continue;
		targets.set(row.id, row.assign_to === 'group' ? 'group' : 'personnel');
	}

	return targets;
}

async function getAssignmentTarget(ctx: WritePorts, assignmentTypeId: string): Promise<AssignmentTarget> {
	return (await getAssignmentTargets(ctx, [assignmentTypeId])).get(assignmentTypeId) ?? 'personnel';
}

async function getPersonnelAssigneeIds(
	ctx: WritePorts,
	records: Array<{ assignmentTypeId: string; assigneeId: string }>
): Promise<string[]> {
	const targets = await getAssignmentTargets(
		ctx,
		records.map((record) => record.assignmentTypeId)
	);

	return [
		...new Set(
			records
				.filter((record) => record.assigneeId && targets.get(record.assignmentTypeId) !== 'group')
				.map((record) => record.assigneeId)
		)
	];
}

async function requireExistingAssignmentAccess(ctx: WritePorts, filters: Record<string, unknown>): Promise<void> {
	const lookupStore = ctx.rawStore ?? ctx.store;
	const existingRows = await lookupStore.findMany<Record<string, unknown>>(entity.table, ctx.auth.orgId, filters, {
		select: 'assignee_id, assignment_type_id'
	});
	await requireCalendarAssignmentRowsPolicy(ctx, existingRows);

	if (!ctx.auth.scopedGroupId) return;

	const assignmentTargets = await getAssignmentTargets(
		ctx,
		existingRows.map((row) => row.assignment_type_id).filter((id): id is string => typeof id === 'string')
	);
	const personnelAssigneeIds = [
		...new Set(
			existingRows
				.filter((row) => typeof row.assignee_id === 'string')
				.filter((row) => {
					if (typeof row.assignment_type_id !== 'string') return true;
					return assignmentTargets.get(row.assignment_type_id) !== 'group';
				})
				.map((row) => row.assignee_id as string)
		)
	];

	if (personnelAssigneeIds.length > 0) {
		await ctx.auth.requireGroupAccessBatch(personnelAssigneeIds);
	}
}

async function requireExistingAssignmentAccessById(
	ctx: WritePorts,
	id: string
): Promise<Record<string, unknown> | null> {
	const lookupStore = ctx.rawStore ?? ctx.store;
	const existingRow = await lookupStore.findOne<Record<string, unknown>>(
		entity.table,
		ctx.auth.orgId,
		{ id },
		'assignee_id, assignment_type_id'
	);
	if (!existingRow) {
		return null;
	}

	await requireCalendarAssignmentRowsPolicy(ctx, [existingRow]);

	if (!ctx.auth.scopedGroupId) return existingRow;

	const assigneeId = existingRow?.assignee_id;
	const assignmentTypeId = existingRow?.assignment_type_id;

	if (typeof assigneeId === 'string' && typeof assignmentTypeId === 'string') {
		const assignmentTarget = await getAssignmentTarget(ctx, assignmentTypeId);
		if (assignmentTarget === 'group') return existingRow;
		await ctx.auth.requireGroupAccess(assigneeId);
	}

	return existingRow;
}

async function requireCalendarAssignmentRowsPolicy(ctx: WritePorts, rows: Record<string, unknown>[]): Promise<void> {
	await requireCalendarAssignmentPolicy(
		ctx,
		rows
			.map((row) => ({
				assignmentTypeId: row.assignment_type_id,
				assigneeId: row.assignee_id
			}))
			.filter(
				(record): record is AssignmentPolicyRecord =>
					typeof record.assignmentTypeId === 'string' && typeof record.assigneeId === 'string'
			)
	);
}

async function requireCalendarAssignmentPolicy(ctx: WritePorts, records: AssignmentPolicyRecord[]): Promise<void> {
	if (records.length === 0) {
		await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageAvailability);
		return;
	}

	const assignmentTargets = await getAssignmentTargets(
		ctx,
		records.map((record) => record.assignmentTypeId)
	);
	const personnelAssigneeIds: string[] = [];
	const groupAssigneeIds: string[] = [];

	for (const record of records) {
		if (assignmentTargets.get(record.assignmentTypeId) === 'group') {
			groupAssigneeIds.push(record.assigneeId);
		} else {
			personnelAssigneeIds.push(record.assigneeId);
		}
	}

	if (personnelAssigneeIds.length > 0) {
		await requireCalendarPersonnelPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageAvailability, personnelAssigneeIds);
	}

	for (const groupId of new Set(groupAssigneeIds.filter(Boolean))) {
		await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageAvailability, { kind: 'group', groupId });
	}
}

export interface ReplaceInput {
	date: string;
	records: Array<{ assignmentTypeId: string; assigneeId: string }>;
}

export async function replaceDailyAssignments(ctx: WritePorts, input: ReplaceInput): Promise<unknown[]> {
	const { date, records } = input;

	// Enforce group scope on all assignee personnel IDs
	const assigneeIds = await getPersonnelAssigneeIds(ctx, records);
	await requireCalendarAssignmentPolicy(ctx, records);
	if (assigneeIds.length > 0) {
		await ctx.auth.requireGroupAccessBatch(assigneeIds);
	}
	const assignmentTargets = await getAssignmentTargets(
		ctx,
		records.map((record) => record.assignmentTypeId)
	);
	for (const record of records) {
		if (assignmentTargets.get(record.assignmentTypeId) === 'group') continue;
		await ensureManualAssignmentAvailability(ctx, {
			date,
			assigneeId: record.assigneeId
		});
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
	const validated = entity.createSchema.parse(input) as Record<string, unknown>;
	const assignmentTypeId = validated.assignmentTypeId as string;
	const assigneeId = validated.assigneeId as string;
	const assignmentTarget = await getAssignmentTarget(ctx, assignmentTypeId);

	await requireCalendarAssignmentPolicy(ctx, [{ assignmentTypeId, assigneeId }]);
	if (assignmentTarget !== 'group') {
		await ctx.auth.requireGroupAccess(assigneeId);
	}

	const dbData = entity.toDbInsert(validated, ctx.auth.orgId);
	const row = await ctx.store.insert<Record<string, unknown>>(entity.table, ctx.auth.orgId, dbData);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.created`,
		resourceType: AUDIT_RESOURCE,
		resourceId: row.id as string | undefined
	});

	return entity.fromDb(row);
}

async function ensureManualAssignmentAvailability(
	ctx: WritePorts,
	input: {
		date: string;
		assigneeId: string;
	}
): Promise<void> {
	const personnelRows = await ctx.store.findMany<Record<string, unknown>>('personnel', ctx.auth.orgId, undefined, {
		inFilters: { id: [input.assigneeId] }
	});
	const personnelById = new Map(PersonnelEntity.fromDbArray(personnelRows).map((person) => [person.id, person]));
	const conflicts = await findDutyCoverageConflicts(ctx, {
		assigneeIds: [input.assigneeId],
		coverageStart: `${input.date}T00:00:00`,
		coverageEnd: `${input.date}T23:59:59`,
		cooldownHours: 0,
		personnelById
	});
	const conflictMessage = conflicts.get(input.assigneeId)?.[0];
	if (conflictMessage) {
		fail(409, conflictMessage);
	}
}

export async function setDailyAssignment(ctx: WritePorts, input: Record<string, unknown>): Promise<unknown> {
	const validated = entity.createSchema.parse(input) as Record<string, unknown>;
	const date = validated.date as string;
	const assignmentTypeId = validated.assignmentTypeId as string;
	const assigneeId = validated.assigneeId as string;
	await requireCalendarAssignmentPolicy(ctx, [{ assignmentTypeId, assigneeId }]);
	const assignmentTarget = await getAssignmentTarget(ctx, assignmentTypeId);

	if (assignmentTarget !== 'group') {
		await ctx.auth.requireGroupAccess(assigneeId);
		await ensureManualAssignmentAvailability(ctx, { date, assigneeId });
	}
	await clearDailyAssignment(ctx, { date, assignmentTypeId });

	return createDailyAssignment(ctx, validated);
}

export async function updateDailyAssignment(ctx: WritePorts, input: Record<string, unknown>): Promise<unknown> {
	const validated = entity.updateSchema.parse(input) as Record<string, unknown>;
	const { id } = validated as { id: string };
	const assigneeId = validated.assigneeId as string | undefined;

	await requireExistingAssignmentAccessById(ctx, id);

	if (assigneeId) {
		const existingRow = await ctx.store.findOne<Record<string, unknown>>(
			entity.table,
			ctx.auth.orgId,
			{ id },
			'date, assignment_type_id'
		);
		const date = typeof validated.date === 'string' ? validated.date : String(existingRow?.date ?? '');
		const assignmentTypeId =
			typeof validated.assignmentTypeId === 'string'
				? validated.assignmentTypeId
				: String(existingRow?.assignment_type_id ?? '');
		await requireCalendarAssignmentPolicy(ctx, [{ assignmentTypeId, assigneeId }]);
		if (!date) {
			fail(404, 'Daily assignment not found');
		}
		if (assignmentTypeId && (await getAssignmentTarget(ctx, assignmentTypeId)) !== 'group') {
			await ctx.auth.requireGroupAccess(assigneeId);
			await ensureManualAssignmentAvailability(ctx, { date, assigneeId });
		}
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
	const existingRow = await requireExistingAssignmentAccessById(ctx, id);
	const assignmentTypeId = existingRow?.assignment_type_id;
	const assigneeId = existingRow?.assignee_id;
	if (typeof assignmentTypeId !== 'string' || typeof assigneeId !== 'string') {
		await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageAvailability);
	}

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
