import type { CalendarWritePorts } from './calendarPolicy.server';
import { dailyAssignmentSlotInput } from './calendarPersistenceMapping.server';
import { listAssignmentTypeTargets } from './assignmentTypeRead.server';
import {
	CALENDAR_POLICY_ACTIONS,
	requireCalendarPersonnelPolicy,
	requireCalendarPolicy
} from './calendarPolicy.server';
import { auditAssignmentChanges, type AssignmentAuditChange } from './dailyAssignmentAudit.server';
import { fail } from '$lib/errors';
import { issueMessage } from '$lib/utils/inputSchemas';

const MAX_BATCH_SIZE = 1000;

type AssignmentTarget = 'personnel' | 'group';
type AssignmentPolicyRecord = { assignmentTypeId: string; assigneeId: string };
type AssignmentSlot = { date: string; assignmentTypeId: string };

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
	const existing = await requireExistingAssignmentAccess(ctx, input.date);
	const inserted = await ctx.calendarAssignmentReplacement.replace(ctx.auth.orgId, [input.date], records);

	const before = new Map(existing.map((row) => [row.assignmentTypeId, row.assigneeId]));
	const kept = new Set(records.map((record) => record.assignmentTypeId));
	await auditAssignmentChanges(ctx, [
		...records.flatMap((record): AssignmentAuditChange[] => {
			const was = before.get(record.assignmentTypeId);
			return was === record.assigneeId ? [] : [{ ...record, kind: was === undefined ? 'created' : 'updated' }];
		}),
		...existing
			.filter((row) => !kept.has(row.assignmentTypeId))
			.map((row): AssignmentAuditChange => ({ ...row, date: input.date, kind: 'cleared' }))
	]);

	return inserted;
}

export async function setDailyAssignmentSlot(
	ctx: CalendarWritePorts,
	input: Record<string, unknown>
): Promise<unknown> {
	const parsed = dailyAssignmentSlotInput.safeParse(input);
	if (!parsed.success) fail(400, issueMessage(parsed.error));
	const record = parsed.data;
	if (!record.assigneeId.trim()) fail(400, 'Assignee ID is required to set an assignment');

	await requireCalendarAssignmentPolicy(ctx, [record]);
	const [existing] = await requireExistingAssignmentAccess(ctx, record.date, record.assignmentTypeId);
	const [inserted] = await ctx.calendarAssignmentReplacement.replace(ctx.auth.orgId, [], [record]);
	if (!inserted) fail(500, 'Daily assignment replacement returned no row');
	if (existing?.assigneeId !== record.assigneeId) {
		await auditAssignmentChanges(ctx, [{ ...record, kind: existing ? 'updated' : 'created' }]);
	}
	return inserted;
}

const dailyAssignmentSlotKey = dailyAssignmentSlotInput.pick({ date: true, assignmentTypeId: true });

export async function clearDailyAssignmentSlot(
	ctx: CalendarWritePorts,
	rawInput: Record<string, unknown>
): Promise<void> {
	const parsed = dailyAssignmentSlotKey.safeParse(rawInput);
	if (!parsed.success) fail(400, issueMessage(parsed.error));
	const input = parsed.data;
	const existing = await requireExistingAssignmentAccess(ctx, input.date, input.assignmentTypeId);

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

	if (existing.length > 0) await auditAssignmentChanges(ctx, [{ ...input, assigneeId: '', kind: 'cleared' }]);
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
				{ date: record.date, assignmentTypeId: record.assignmentTypeId }
			])
		).values()
	];
	const existingBySlot = await requireExistingAssignmentSlotPolicy(ctx, affectedSlotFilters);
	if (clears.some((record) => !existingBySlot.has(toSlotKey(record.date, record.assignmentTypeId)))) {
		await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageAssignments);
	}
	const inserted = await ctx.calendarAssignmentReplacement.replace(ctx.auth.orgId, [], records);

	await auditAssignmentChanges(
		ctx,
		records.flatMap((record): AssignmentAuditChange[] => {
			const was = existingBySlot.get(toSlotKey(record.date, record.assignmentTypeId));
			if (!record.assigneeId) return was === undefined ? [] : [{ ...record, kind: 'cleared' }];
			return was === record.assigneeId ? [] : [{ ...record, kind: was === undefined ? 'created' : 'updated' }];
		})
	);

	return { inserted, cleared: clears.length };
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

	const rows = await listAssignmentTypeTargets(ctx.calendarCatalogs, uniqueIds);

	for (const row of rows) {
		targets.set(row.id, row.assignTo);
	}

	return targets;
}

async function requireExistingAssignmentAccess(ctx: CalendarWritePorts, date: string, assignmentTypeId?: string) {
	const existingRows = await ctx.calendarAssignments.listDayReferences(date, assignmentTypeId);
	await requireCalendarAssignmentRowsPolicy(ctx, existingRows);
	return existingRows;
}

async function requireExistingAssignmentSlotPolicy(
	ctx: CalendarWritePorts,
	slotFilters: AssignmentSlot[]
): Promise<Map<string, string>> {
	if (slotFilters.length === 0) return new Map();

	const affectedRows = await ctx.calendarAssignments.listSlotReferences(slotFilters);
	if (affectedRows.length === 0) return new Map();

	await requireCalendarAssignmentRowsPolicy(ctx, affectedRows);
	return new Map(affectedRows.map((row) => [toSlotKey(row.date, row.assignmentTypeId), row.assigneeId]));
}

async function requireCalendarAssignmentRowsPolicy(
	ctx: CalendarWritePorts,
	rows: AssignmentPolicyRecord[]
): Promise<void> {
	await requireCalendarAssignmentPolicy(ctx, rows);
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
		const parsed = dailyAssignmentSlotInput.safeParse(record);
		if (!parsed.success) fail(400, issueMessage(parsed.error));
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
