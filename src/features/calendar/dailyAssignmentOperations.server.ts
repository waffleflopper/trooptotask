import type { CalendarWritePorts } from '$lib/server/core/useCases/calendarPolicy';
import { DailyAssignmentEntity } from './dailyAssignmentEntity.server';
import { listAssignmentTypeTargets } from './assignmentTypeRead.server';
import {
	CALENDAR_POLICY_ACTIONS,
	requireCalendarPersonnelPolicy,
	requireCalendarPolicy
} from '$lib/server/core/useCases/calendarPolicy';

const entity = DailyAssignmentEntity;
const AUDIT_RESOURCE = 'daily_assignment';
const MAX_BATCH_SIZE = 1000;

function fail(status: number, message: string): never {
	throw Object.assign(new Error(message), { status });
}

type AssignmentTarget = 'personnel' | 'group';
type AssignmentPolicyRecord = { assignmentTypeId: string; assigneeId: string };
type AssignmentSlotFilter = { date: string; assignment_type_id: string };

export type DailyAssignmentSlotRecord = {
	date: string;
	assignmentTypeId: string;
	assigneeId: string;
};

export type DailyAssignmentDayRecord = Omit<DailyAssignmentSlotRecord, 'date'>;

export type DailyAssignmentSlotBatchResult = {
	inserted: unknown[];
	cleared: number;
};

export async function replaceDailyAssignmentDay(
	ctx: CalendarWritePorts,
	input: { date: string; records: DailyAssignmentDayRecord[] }
): Promise<unknown[]> {
	const records = input.records.map((record) => ({ ...record, date: input.date }));

	await requireCalendarAssignmentPolicy(ctx, records);
	await requireExistingAssignmentAccess(ctx, { date: input.date });
	const inserted = await ctx.calendarAssignmentReplacement.replace(ctx.auth.orgId, [input.date], records);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.replaced`,
		resourceType: AUDIT_RESOURCE,
		details: { date: input.date, count: records.length }
	});

	return inserted;
}

export async function setDailyAssignmentSlot(
	ctx: CalendarWritePorts,
	input: Record<string, unknown>
): Promise<unknown> {
	const validated = entity.createSchema.parse(input) as Record<string, unknown>;
	const record = toDailyAssignmentSlotRecord(validated);
	if (!record.assigneeId.trim()) fail(400, 'Assignee ID is required to set an assignment');

	await requireCalendarAssignmentPolicy(ctx, [record]);
	await requireExistingAssignmentAccess(ctx, {
		date: record.date,
		assignment_type_id: record.assignmentTypeId
	});
	const [inserted] = await ctx.calendarAssignmentReplacement.replace(ctx.auth.orgId, [], [record]);
	if (!inserted) fail(500, 'Daily assignment replacement returned no row');
	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.cleared`,
		resourceType: AUDIT_RESOURCE,
		details: { date: record.date, assignmentTypeId: record.assignmentTypeId }
	});
	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.created`,
		resourceType: AUDIT_RESOURCE,
		resourceId: inserted.id
	});
	return inserted;
}

export async function clearDailyAssignmentSlot(
	ctx: CalendarWritePorts,
	input: { date: string; assignmentTypeId: string }
): Promise<void> {
	await requireExistingAssignmentAccess(ctx, {
		date: input.date,
		assignment_type_id: input.assignmentTypeId
	});

	await ctx.calendarAssignmentReplacement.replace(
		ctx.auth.orgId,
		[],
		[
			{
				date: input.date,
				assignmentTypeId: input.assignmentTypeId,
				assigneeId: ''
			}
		]
	);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.cleared`,
		resourceType: AUDIT_RESOURCE,
		details: { date: input.date, assignmentTypeId: input.assignmentTypeId }
	});
}

export async function replaceDailyAssignmentSlotsBatch(
	ctx: CalendarWritePorts,
	input: { records: DailyAssignmentSlotRecord[] }
): Promise<DailyAssignmentSlotBatchResult> {
	const inputRecords = input.records;

	if (!Array.isArray(inputRecords) || inputRecords.length === 0) {
		fail(400, 'records array is required');
	}

	if (inputRecords.length > MAX_BATCH_SIZE) {
		fail(400, `Maximum ${MAX_BATCH_SIZE} records per batch`);
	}

	requireValidBatchRecords(inputRecords);
	const records = normalizeBatchRecords(inputRecords);
	const duplicateSlot = duplicateBatchSlot(records);
	if (duplicateSlot) {
		fail(400, `Duplicate daily assignment slot in batch: ${duplicateSlot.date} / ${duplicateSlot.assignmentTypeId}`);
	}

	const upserts = records.filter((record) => record.assigneeId);
	const clears = records.filter((record) => !record.assigneeId);

	await requireCalendarAssignmentPolicy(ctx, upserts);

	const affectedSlotFilters = [
		...new Map(
			records.map((record) => [
				toSlotKey(record.date, record.assignmentTypeId),
				{ date: record.date, assignment_type_id: record.assignmentTypeId }
			])
		).values()
	];
	const affectedSlotKeys = await requireExistingAssignmentSlotPolicy(ctx, affectedSlotFilters);
	if (clears.some((record) => !affectedSlotKeys.has(toSlotKey(record.date, record.assignmentTypeId)))) {
		await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageAssignments);
	}
	const inserted = await ctx.calendarAssignmentReplacement.replace(ctx.auth.orgId, [], records);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.batch_replaced`,
		resourceType: AUDIT_RESOURCE,
		details: { totalSlots: records.length, inserted: inserted.length, cleared: clears.length }
	});

	return { inserted, cleared: clears.length };
}

function toDailyAssignmentSlotRecord(record: Record<string, unknown>): DailyAssignmentSlotRecord {
	return {
		date: record.date as string,
		assignmentTypeId: record.assignmentTypeId as string,
		assigneeId: record.assigneeId as string
	};
}

async function getAssignmentTargets(
	ctx: CalendarWritePorts,
	assignmentTypeIds: string[]
): Promise<Map<string, AssignmentTarget>> {
	const uniqueIds = [...new Set(assignmentTypeIds.filter((id) => typeof id === 'string' && id.length > 0))];
	const targets = new Map<string, AssignmentTarget>(uniqueIds.map((id) => [id, 'personnel']));

	if (uniqueIds.length === 0) {
		return targets;
	}

	const rows = await listAssignmentTypeTargets(ctx.store, ctx.auth.orgId, uniqueIds);

	for (const row of rows) {
		if (typeof row.id !== 'string') continue;
		targets.set(row.id, row.assign_to === 'group' ? 'group' : 'personnel');
	}

	return targets;
}

async function requireExistingAssignmentAccess(
	ctx: CalendarWritePorts,
	filters: Record<string, unknown>
): Promise<void> {
	const lookupStore = ctx.rawStore ?? ctx.store;
	const existingRows = await lookupStore.findMany<Record<string, unknown>>(entity.table, ctx.auth.orgId, filters, {
		select: 'assignee_id, assignment_type_id'
	});
	await requireCalendarAssignmentRowsPolicy(ctx, existingRows);
}

async function requireExistingAssignmentSlotPolicy(
	ctx: CalendarWritePorts,
	slotFilters: AssignmentSlotFilter[]
): Promise<Set<string>> {
	if (slotFilters.length === 0) return new Set();

	const lookupStore = ctx.rawStore ?? ctx.store;
	const affectedSlotKeys = new Set(slotFilters.map((filter) => toSlotKey(filter.date, filter.assignment_type_id)));
	const existingRows = await lookupStore.findMany<Record<string, unknown>>(entity.table, ctx.auth.orgId, undefined, {
		inFilters: {
			date: [...new Set(slotFilters.map((filter) => filter.date))],
			assignment_type_id: [...new Set(slotFilters.map((filter) => filter.assignment_type_id))]
		},
		select: 'date, assignment_type_id, assignee_id'
	});
	const affectedRows = existingRows.filter(
		(row) =>
			typeof row.date === 'string' &&
			typeof row.assignment_type_id === 'string' &&
			affectedSlotKeys.has(toSlotKey(row.date, row.assignment_type_id))
	);
	if (affectedRows.length === 0) return new Set();

	await requireCalendarAssignmentRowsPolicy(ctx, affectedRows);
	return new Set(affectedRows.map((row) => toSlotKey(String(row.date), String(row.assignment_type_id))));
}

async function requireCalendarAssignmentRowsPolicy(
	ctx: CalendarWritePorts,
	rows: Record<string, unknown>[]
): Promise<void> {
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

async function requireCalendarAssignmentPolicy(
	ctx: CalendarWritePorts,
	records: AssignmentPolicyRecord[]
): Promise<void> {
	if (records.length === 0) {
		await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageAssignments);
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
		await requireCalendarPersonnelPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageAssignments, personnelAssigneeIds);
	}

	for (const groupId of new Set(groupAssigneeIds.filter(Boolean))) {
		await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageAssignments, { kind: 'group', groupId });
	}
}

function normalizeBatchRecords(records: DailyAssignmentSlotRecord[]): DailyAssignmentSlotRecord[] {
	return records.map((record) => ({ ...record, assigneeId: record.assigneeId.trim() }));
}

function requireValidBatchRecords(records: DailyAssignmentSlotRecord[]): void {
	for (const record of records) {
		if (
			typeof record?.date !== 'string' ||
			typeof record?.assignmentTypeId !== 'string' ||
			typeof record?.assigneeId !== 'string'
		) {
			fail(400, 'Each record must include string date, assignmentTypeId, and assigneeId');
		}
	}
}

function duplicateBatchSlot(records: DailyAssignmentSlotRecord[]): DailyAssignmentSlotRecord | null {
	const seen = new Set<string>();

	for (const record of records) {
		const key = toSlotKey(record.date, record.assignmentTypeId);
		if (seen.has(key)) return record;
		seen.add(key);
	}

	return null;
}

function toSlotKey(date: string, assignmentTypeId: string): string {
	return `${date}::${assignmentTypeId}`;
}
