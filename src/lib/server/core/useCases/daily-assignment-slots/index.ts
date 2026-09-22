import { fail } from '$lib/server/core/errors';
import type { WritePorts } from '$lib/server/core/ports';
import { DailyAssignmentEntity } from '$lib/server/entities/dailyAssignment';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPersonnelPolicy, requireCalendarPolicy } from '../calendarPolicy';

const entity = DailyAssignmentEntity;
const AUDIT_RESOURCE = 'daily_assignment';
const MAX_BATCH_SIZE = 1000;

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
	ctx: WritePorts,
	input: { date: string; records: DailyAssignmentDayRecord[] }
): Promise<unknown[]> {
	const records = input.records.map((record) => ({ ...record, date: input.date }));

	await requireCalendarAssignmentPolicy(ctx, records);
	await requireExistingAssignmentAccess(ctx, { date: input.date });

	const replacedRows = await findDailyAssignmentRows(ctx, { date: input.date });
	await ctx.store.deleteWhere(entity.table, ctx.auth.orgId, { date: input.date });

	const rows = records.map((record) => toDailyAssignmentDbInsert(record, ctx.auth.orgId));
	let inserted: Record<string, unknown>[];
	try {
		inserted = await ctx.store.insertMany<Record<string, unknown>>(entity.table, ctx.auth.orgId, rows);
	} catch (error) {
		await tryRestoreDailyAssignmentRows(
			ctx,
			replacedRows,
			error,
			'Failed to restore Daily Assignment rows after day replacement insert failure'
		);
		throw error;
	}

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.replaced`,
		resourceType: AUDIT_RESOURCE,
		details: { date: input.date, count: records.length }
	});

	return inserted.map((row) => entity.fromDb(row));
}

export async function createDailyAssignmentSlot(ctx: WritePorts, input: Record<string, unknown>): Promise<unknown> {
	const validated = entity.createSchema.parse(input) as Record<string, unknown>;
	const record = toDailyAssignmentSlotRecord(validated);

	await requireCalendarAssignmentPolicy(ctx, [record]);

	const dbData = toDailyAssignmentDbInsert(record, ctx.auth.orgId);
	const row = await ctx.store.insert<Record<string, unknown>>(entity.table, ctx.auth.orgId, dbData);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.created`,
		resourceType: AUDIT_RESOURCE,
		resourceId: row.id as string | undefined
	});

	return entity.fromDb(row);
}

export async function setDailyAssignmentSlot(ctx: WritePorts, input: Record<string, unknown>): Promise<unknown> {
	const validated = entity.createSchema.parse(input) as Record<string, unknown>;
	const record = toDailyAssignmentSlotRecord(validated);

	await requireCalendarAssignmentPolicy(ctx, [record]);
	const replacedRows = await findDailyAssignmentRows(ctx, {
		date: record.date,
		assignment_type_id: record.assignmentTypeId
	});
	await clearDailyAssignmentSlot(ctx, { date: record.date, assignmentTypeId: record.assignmentTypeId });

	try {
		return await createDailyAssignmentSlot(ctx, validated);
	} catch (error) {
		await tryRestoreDailyAssignmentRows(
			ctx,
			replacedRows,
			error,
			'Failed to restore Daily Assignment rows after slot replacement insert failure'
		);
		throw error;
	}
}

export async function updateDailyAssignmentSlot(ctx: WritePorts, input: Record<string, unknown>): Promise<unknown> {
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
		const record = { date, assignmentTypeId, assigneeId };
		await requireCalendarAssignmentPolicy(ctx, [record]);
		if (!date) {
			fail(404, 'Daily assignment not found');
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

export async function deleteDailyAssignmentSlot(ctx: WritePorts, id: string): Promise<void> {
	const existingRow = await requireExistingAssignmentAccessById(ctx, id);
	const assignmentTypeId = existingRow?.assignment_type_id;
	const assigneeId = existingRow?.assignee_id;
	if (typeof assignmentTypeId !== 'string' || typeof assigneeId !== 'string') {
		await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageAssignments);
	}

	await ctx.store.delete(entity.table, ctx.auth.orgId, id);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.deleted`,
		resourceType: AUDIT_RESOURCE,
		resourceId: id
	});
}

export async function clearDailyAssignmentSlot(
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

export async function replaceDailyAssignmentSlotsBatch(
	ctx: WritePorts,
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
	const replacedRows = await findDailyAssignmentRowsMatchingAny(ctx, affectedSlotFilters);
	await ctx.store.deleteWhereAny(entity.table, ctx.auth.orgId, affectedSlotFilters);

	let inserted: unknown[] = [];
	if (upserts.length > 0) {
		const rows = upserts.map((record) => toDailyAssignmentDbInsert(record, ctx.auth.orgId));
		let insertedRows: Record<string, unknown>[];
		try {
			insertedRows = await ctx.store.insertMany<Record<string, unknown>>(entity.table, ctx.auth.orgId, rows);
		} catch (error) {
			await tryRestoreDailyAssignmentRows(
				ctx,
				replacedRows,
				error,
				'Failed to restore Daily Assignment rows after batch replacement insert failure'
			);
			throw error;
		}
		inserted = insertedRows.map((row) => entity.fromDb(row));
	}

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

function toDailyAssignmentDbInsert(record: DailyAssignmentSlotRecord, orgId: string): Record<string, unknown> {
	return entity.toDbInsert(
		{
			date: record.date,
			assignmentTypeId: record.assignmentTypeId,
			assigneeId: record.assigneeId
		},
		orgId
	);
}

async function findDailyAssignmentRows(
	ctx: WritePorts,
	filters: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
	return ctx.store.findMany<Record<string, unknown>>(entity.table, ctx.auth.orgId, filters);
}

async function findDailyAssignmentRowsMatchingAny(
	ctx: WritePorts,
	slotFilters: AssignmentSlotFilter[]
): Promise<Record<string, unknown>[]> {
	if (slotFilters.length === 0) return [];

	const affectedSlotKeys = new Set(slotFilters.map((filter) => toSlotKey(filter.date, filter.assignment_type_id)));
	const rows = await ctx.store.findMany<Record<string, unknown>>(entity.table, ctx.auth.orgId, undefined, {
		inFilters: {
			date: [...new Set(slotFilters.map((filter) => filter.date))],
			assignment_type_id: [...new Set(slotFilters.map((filter) => filter.assignment_type_id))]
		}
	});
	return rows.filter(
		(row) =>
			typeof row.date === 'string' &&
			typeof row.assignment_type_id === 'string' &&
			affectedSlotKeys.has(toSlotKey(row.date, row.assignment_type_id))
	);
}

async function tryRestoreDailyAssignmentRows(
	ctx: WritePorts,
	rows: Record<string, unknown>[],
	primaryError: unknown,
	message: string
): Promise<void> {
	if (rows.length === 0) return;

	try {
		await ctx.store.insertMany(entity.table, ctx.auth.orgId, rows.map(toDailyAssignmentDbRestore));
	} catch (restoreError) {
		throw calendarReplacementRollbackFailureError(message, primaryError, restoreError);
	}
}

function toDailyAssignmentDbRestore(row: Record<string, unknown>): Record<string, unknown> {
	const restored = { ...row };
	delete restored.organization_id;
	return restored;
}

function calendarReplacementRollbackFailureError(message: string, primaryError: unknown, restoreError: unknown): Error {
	const error = new Error(
		`${message}. Primary failure: ${errorMessage(primaryError)}. Restore failure: ${errorMessage(restoreError)}.`
	);
	return Object.assign(error, { primaryError, restoreError });
}

function errorMessage(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.replace(/[.]+$/, '');
}

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

async function requireExistingAssignmentAccess(ctx: WritePorts, filters: Record<string, unknown>): Promise<void> {
	const lookupStore = ctx.rawStore ?? ctx.store;
	const existingRows = await lookupStore.findMany<Record<string, unknown>>(entity.table, ctx.auth.orgId, filters, {
		select: 'assignee_id, assignment_type_id'
	});
	await requireCalendarAssignmentRowsPolicy(ctx, existingRows);
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

	return existingRow;
}

async function requireExistingAssignmentSlotPolicy(
	ctx: WritePorts,
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
