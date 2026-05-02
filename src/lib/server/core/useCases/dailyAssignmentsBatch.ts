/**
 * Bulk daily assignment use case — import assignments across many dates at once.
 *
 * `batchImportAssignments` accepts up to MAX_BATCH_SIZE (1000) assignment rows and
 * upserts them in one round-trip. Intended for duty-roster generation and CSV import.
 *
 * For single-day atomic replacement, see `dailyAssignments.ts` (`replaceAssignments`).
 */
import { fail } from '$lib/server/core/errors';
import { DailyAssignmentEntity } from '$lib/server/entities/dailyAssignment';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import type { WritePorts } from '$lib/server/core/ports';
import { findDutyCoverageConflictsBatch, type DutyCoverageConflictCheck } from './dutyAvailability';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPersonnelPolicy } from './calendarPolicy';

const entity = DailyAssignmentEntity;
const AUDIT_RESOURCE = 'daily_assignment';
const MAX_BATCH_SIZE = 1000;

type AssignmentTarget = 'personnel' | 'group';

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

export async function batchDailyAssignments(ctx: WritePorts, input: BatchInput): Promise<BatchResult> {
	const { records } = input;

	if (!Array.isArray(records) || records.length === 0) {
		fail(400, 'records array is required');
	}

	if (records.length > MAX_BATCH_SIZE) {
		fail(400, `Maximum ${MAX_BATCH_SIZE} records per batch`);
	}

	const upserts = records.filter((r) => r.assigneeId);
	const clears = records.filter((r) => !r.assigneeId);
	const assignmentTargets = await getAssignmentTargets(
		ctx,
		upserts.map((record) => record.assignmentTypeId)
	);

	// Enforce group scope on all assignee personnel IDs
	const assigneeIds = [
		...new Set(
			upserts
				.filter((record) => assignmentTargets.get(record.assignmentTypeId) !== 'group')
				.map((record) => record.assigneeId)
		)
	];
	await requireCalendarPersonnelPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageAvailability, assigneeIds);
	if (assigneeIds.length > 0) {
		await ctx.auth.requireGroupAccessBatch(assigneeIds);
	}

	if (assigneeIds.length > 0) {
		const personnelRows = await ctx.store.findMany<Record<string, unknown>>('personnel', ctx.auth.orgId, undefined, {
			inFilters: { id: [...new Set(assigneeIds)] }
		});
		const personnelById = new Map(PersonnelEntity.fromDbArray(personnelRows).map((person) => [person.id, person]));

		const checks: DutyCoverageConflictCheck[] = upserts
			.filter((record) => assignmentTargets.get(record.assignmentTypeId) !== 'group')
			.map((record, index) => ({
				key: String(index),
				assigneeId: record.assigneeId,
				coverageStart: `${record.date}T00:00:00`,
				coverageEnd: `${record.date}T23:59:59`,
				cooldownHours: 0
			}));
		const conflictsByCheck = await findDutyCoverageConflictsBatch(ctx, {
			checks,
			personnelById
		});
		for (const check of checks) {
			const conflictMessage = conflictsByCheck.get(check.key)?.[0];
			if (conflictMessage) {
				fail(409, conflictMessage);
			}
		}
	}

	// Clear all affected slots first.
	const affectedSlotFilters = [
		...new Map(
			records.map((rec) => [
				`${rec.date}::${rec.assignmentTypeId}`,
				{ date: rec.date, assignment_type_id: rec.assignmentTypeId }
			])
		).values()
	];
	await ctx.store.deleteWhereAny(entity.table, ctx.auth.orgId, affectedSlotFilters);

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
