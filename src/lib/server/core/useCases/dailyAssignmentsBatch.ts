import { fail } from '$lib/server/core/errors';
import { DailyAssignmentEntity } from '$lib/server/entities/dailyAssignment';
import type { UseCaseContext } from '$lib/server/core/ports';

const entity = DailyAssignmentEntity;
const AUDIT_RESOURCE = 'daily_assignment';
const MAX_BATCH_SIZE = 1000;

interface BatchRecord {
	date: string;
	assignmentTypeId: string;
	assigneeId: string; // empty string = clear slot
}

interface BatchInput {
	records: BatchRecord[];
}

interface BatchResult {
	inserted: unknown[];
	cleared: number;
}

export async function batchDailyAssignments(ctx: UseCaseContext, input: BatchInput): Promise<BatchResult> {
	ctx.auth.requireEdit('calendar');

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) fail(403, 'Organization is in read-only mode');

	const { records } = input;

	if (!Array.isArray(records) || records.length === 0) {
		fail(400, 'records array is required');
	}

	if (records.length > MAX_BATCH_SIZE) {
		fail(400, `Maximum ${MAX_BATCH_SIZE} records per batch`);
	}

	const upserts = records.filter((r) => r.assigneeId);
	const clears = records.filter((r) => !r.assigneeId);

	// Enforce group scope on all assignee personnel IDs
	const assigneeIds = upserts.map((r) => r.assigneeId);
	if (assigneeIds.length > 0) {
		await ctx.auth.requireGroupAccessBatch(assigneeIds);
	}

	// Clear all affected slots first
	for (const rec of records) {
		await ctx.store.deleteWhere(entity.table, ctx.auth.orgId, {
			date: rec.date,
			assignment_type_id: rec.assignmentTypeId
		});
	}

	// Insert all upserts
	let inserted: unknown[] = [];
	if (upserts.length > 0) {
		const rows = upserts.map((r) =>
			entity.toDbInsert(
				{ date: r.date, assignmentTypeId: r.assignmentTypeId, assigneeId: r.assigneeId },
				ctx.auth.orgId
			)
		);
		const insertedRows = await ctx.store.insertMany<Record<string, unknown>>(entity.table, ctx.auth.orgId, rows);
		inserted = insertedRows.map((row) => entity.fromDb(row));
	}

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.batch_replaced`,
		resourceType: AUDIT_RESOURCE,
		details: { totalSlots: records.length, inserted: inserted.length, cleared: clears.length }
	});

	return { inserted, cleared: clears.length };
}
