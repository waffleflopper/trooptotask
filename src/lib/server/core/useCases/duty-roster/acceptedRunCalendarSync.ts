import { createHash } from 'node:crypto';
import type { QueryPorts, WritePorts } from '$lib/server/core/ports';
import type {
	AcceptedDutyRosterRunCalendarSyncPlan,
	AcceptedDutyRosterRunCalendarSyncPlanChange,
	AcceptedDutyRosterRunCalendarSyncState,
	AcceptedDutyRosterRunCalendarSyncStatus,
	DutyRosterPoolPersonnelDisplay,
	DutyRosterTemplateAcceptedRun,
	DutyRosterTemplateRunCorrection
} from '$features/duty-roster/templates/dutyRosterTemplates';
import { batchDailyAssignments } from '../dailyAssignmentsBatch';
import {
	applyRecordsFromAcceptedRun,
	expectedCalendarAssignmentsByRowDate,
	linkedCalendarAssignmentsWereEdited,
	parseAcceptedRunSnapshot,
	toAcceptedDutyRosterTemplateRun,
	type DutyRosterTemplateLinkedCalendarAssignmentRow,
	type DutyRosterTemplateRunRow
} from './acceptedRunRecord';
import type { DailyAssignmentSlotRecord } from '../daily-assignment-slots';

const DUTY_ROSTER_TEMPLATE_RUN_TABLE = 'duty_roster_template_runs';
const MAX_DUTY_ROSTER_COOLDOWN_HOURS = 168;

type DutyRosterTemplateCalendarAssignmentRow = Omit<
	DutyRosterTemplateLinkedCalendarAssignmentRow,
	'duty_roster_template_run_id'
> & {
	duty_roster_template_run_id: string | null;
};

export type AcceptedDutyRosterRunCalendarSyncApplyResult = {
	acceptedRun: DutyRosterTemplateAcceptedRun;
	insertedCount: number;
	clearedCount: number;
};

export type AcceptedDutyRosterRunCalendarSyncCompensation = {
	result: AcceptedDutyRosterRunCalendarSyncApplyResult;
	rollbackRecords: DailyAssignmentSlotRecord[];
};

export type AcceptedDutyRosterRunInvalidationCalendarCleanupTarget = {
	run: DutyRosterTemplateAcceptedRun;
	linkedRows: DutyRosterTemplateLinkedCalendarAssignmentRow[];
};

export type AcceptedDutyRosterRunInvalidationCalendarCleanupResult = {
	removedCalendarAssignments: number;
	removedCalendarAssignmentCountByRunId: Map<string, number>;
	calendarAssignmentsEditedByRunId: Map<string, boolean>;
	calendarAssignmentsEdited: boolean;
};

export async function applyAcceptedDutyRosterRunCalendarSync(
	ctx: WritePorts,
	run: DutyRosterTemplateAcceptedRun,
	options: { audit?: boolean } = {}
): Promise<AcceptedDutyRosterRunCalendarSyncApplyResult> {
	const compensated = await applyAcceptedDutyRosterRunCalendarSyncWithCompensation(ctx, run, options);
	return compensated.result;
}

export async function applyAcceptedDutyRosterRunCalendarSyncWithCompensation(
	ctx: WritePorts,
	run: DutyRosterTemplateAcceptedRun,
	options: { audit?: boolean } = {}
): Promise<AcceptedDutyRosterRunCalendarSyncCompensation> {
	const records = applyRecordsFromAcceptedRun(run);
	const rollbackRecords = await loadDailyAssignmentRollbackRecords(ctx, records);
	let result: Awaited<ReturnType<typeof batchDailyAssignments>>;
	try {
		result = await batchDailyAssignments(ctx, { records });
	} catch (error) {
		await tryRollbackCalendarSyncRecords(
			ctx,
			rollbackRecords,
			error,
			'Failed to roll back Calendar assignments after accepted run Calendar write failure'
		);
		throw error;
	}

	const appliedAt = new Date().toISOString();
	let updated: DutyRosterTemplateRunRow;
	try {
		updated = await ctx.store.update<DutyRosterTemplateRunRow>(DUTY_ROSTER_TEMPLATE_RUN_TABLE, ctx.auth.orgId, run.id, {
			applied_at: appliedAt,
			applied_by_user_id: ctx.auth.userId
		});
	} catch (error) {
		await tryRollbackCalendarSyncRecords(
			ctx,
			rollbackRecords,
			error,
			'Failed to roll back Calendar assignments after accepted run applied marker failure'
		);
		throw error;
	}

	if (options.audit !== false) {
		await tryLogAcceptedDutyRosterRunAppliedToCalendar(ctx, run.id, {
			inserted: result.inserted.length,
			cleared: result.cleared
		});
	}

	return {
		result: {
			acceptedRun: toAcceptedDutyRosterTemplateRun(updated),
			insertedCount: result.inserted.length,
			clearedCount: result.cleared
		},
		rollbackRecords
	};
}

export async function applyReviewedAcceptedDutyRosterRunCalendarSyncPlan(
	ctx: WritePorts,
	run: DutyRosterTemplateAcceptedRun,
	plan: AcceptedDutyRosterRunCalendarSyncPlan
): Promise<AcceptedDutyRosterRunCalendarSyncApplyResult> {
	if (plan.changes.length === 0) {
		return applyAcceptedDutyRosterRunCalendarSync(ctx, run);
	}

	// Rollback restores the reviewed state that the user confirmed; without row locks a concurrent Calendar edit can
	// still change the live slot after this plan is reviewed, so the plan token remains the write guard.
	const rollbackRecords = plan.changes.map((change) => rollbackRecordFromPlanChange(change));
	let result: Awaited<ReturnType<typeof batchDailyAssignments>>;
	try {
		result = await batchDailyAssignments(ctx, {
			records: plan.changes.map((change) => planChangeToDailyAssignmentRecord(change, run.id))
		});
	} catch (error) {
		await tryRollbackReviewedCalendarSyncPlan(
			ctx,
			rollbackRecords,
			error,
			'Failed to roll back reviewed Calendar sync plan after Calendar write failure'
		);
		throw error;
	}
	const appliedAt = new Date().toISOString();

	try {
		const updated = await ctx.store.update<DutyRosterTemplateRunRow>(
			DUTY_ROSTER_TEMPLATE_RUN_TABLE,
			ctx.auth.orgId,
			run.id,
			{
				applied_at: appliedAt,
				applied_by_user_id: ctx.auth.userId
			}
		);

		const acceptedRun = toAcceptedDutyRosterTemplateRun(updated);
		await tryLogAcceptedDutyRosterRunAppliedToCalendar(ctx, run.id, {
			inserted: result.inserted.length,
			cleared: result.cleared
		});
		return {
			acceptedRun,
			insertedCount: result.inserted.length,
			clearedCount: result.cleared
		};
	} catch (error) {
		await tryRollbackReviewedCalendarSyncPlan(
			ctx,
			rollbackRecords,
			error,
			'Failed to roll back reviewed Calendar sync plan after accepted run applied marker failure'
		);
		throw error;
	}
}

export async function rollbackAcceptedDutyRosterRunCalendarSync(
	ctx: WritePorts,
	runId: string,
	rollbackRecords?: DailyAssignmentSlotRecord[]
): Promise<void> {
	if (rollbackRecords) {
		if (rollbackRecords.length === 0) return;
		await batchDailyAssignments(ctx, { records: rollbackRecords });
		return;
	}
	await ctx.store.deleteWhere('daily_assignments', ctx.auth.orgId, { duty_roster_template_run_id: runId });
}

export async function syncAcceptedDutyRosterCorrectionToCalendar(
	ctx: WritePorts,
	input: {
		runRow: DutyRosterTemplateRunRow;
		runRowDate: string;
		replacementAssigneeId: string;
	}
): Promise<void> {
	const cooldownHours = await loadDutyRosterCorrectionCooldownHours(ctx, input.runRow.template_id);
	await batchDailyAssignments(ctx, {
		records: [
			{
				date: input.runRowDate,
				assignmentTypeId: input.runRow.template_id,
				assigneeId: input.replacementAssigneeId,
				cooldownHours,
				sourceLineage: {
					sourceKind: 'duty-roster-run',
					sourceId: input.runRow.id,
					sourceRowKey: input.runRowDate
				}
			}
		]
	});
}

export async function loadAcceptedDutyRosterRunLinkedCalendarAssignmentsByRunId(
	ctx: QueryPorts,
	rows: DutyRosterTemplateRunRow[]
): Promise<Map<string, DutyRosterTemplateLinkedCalendarAssignmentRow[]>> {
	const linkedRowsByRunId = new Map(rows.map((row) => [row.id, [] as DutyRosterTemplateLinkedCalendarAssignmentRow[]]));
	const appliedRunIds = rows.filter((row) => row.applied_at).map((row) => row.id);
	if (appliedRunIds.length === 0) {
		return linkedRowsByRunId;
	}

	const linkedRows = await ctx.store.findMany<DutyRosterTemplateLinkedCalendarAssignmentRow>(
		'daily_assignments',
		ctx.auth.orgId,
		{},
		{
			inFilters: { duty_roster_template_run_id: appliedRunIds },
			select:
				'id, duty_roster_template_run_id, duty_roster_template_run_row_date, date, assignment_type_id, assignee_id'
		}
	);
	for (const row of linkedRows) {
		const runRows = linkedRowsByRunId.get(row.duty_roster_template_run_id) ?? [];
		runRows.push(row);
		linkedRowsByRunId.set(row.duty_roster_template_run_id, runRows);
	}

	return linkedRowsByRunId;
}

export function acceptedDutyRosterRunCalendarAssignmentsWereEdited(
	run: DutyRosterTemplateAcceptedRun,
	rows: DutyRosterTemplateLinkedCalendarAssignmentRow[]
): boolean {
	return linkedCalendarAssignmentsWereEdited(run, rows);
}

export function buildAcceptedDutyRosterRunCalendarSyncState(
	run: DutyRosterTemplateAcceptedRun,
	rows: DutyRosterTemplateCalendarAssignmentRow[]
): AcceptedDutyRosterRunCalendarSyncState {
	if (!run.appliedAt) {
		return {
			status: 'not-applied',
			label: 'Not applied',
			summary: 'This accepted Duty Roster Run has not been applied to Calendar.',
			plan: { token: planToken([]), changes: [] },
			invalidationRemovalSummary: null
		};
	}

	const changes = buildCalendarSyncPlanChanges(run, rows);
	const status = classifyCalendarSyncStatus(run, rows, changes);
	const linkedCount = linkedRowsForRun(rows, run.id).length;
	return {
		status,
		label: calendarSyncStatusLabel(status),
		summary: calendarSyncStatusSummary(status, changes.length),
		plan: { token: planToken(changes), changes },
		invalidationRemovalSummary:
			linkedCount > 0
				? `${linkedCount} linked Calendar ${linkedCount === 1 ? 'assignment came' : 'assignments came'} from this Accepted Duty Roster Run and will be removed if the run is invalidated.`
				: null
	};
}

export async function loadAcceptedDutyRosterRunCalendarSyncState(
	ctx: QueryPorts,
	run: DutyRosterTemplateAcceptedRun
): Promise<AcceptedDutyRosterRunCalendarSyncState> {
	const rowsByRunId = await loadAcceptedDutyRosterRunCalendarAssignmentsByRunId(ctx, [run]);
	return buildAcceptedDutyRosterRunCalendarSyncState(run, rowsByRunId.get(run.id) ?? []);
}

export async function removeAcceptedDutyRosterRunLinkedCalendarAssignments(
	ctx: WritePorts,
	_runId: string,
	linkedRows: DutyRosterTemplateLinkedCalendarAssignmentRow[]
): Promise<{ cleared: number; deletedIds: string[] }> {
	if (linkedRows.length === 0) {
		return { cleared: 0, deletedIds: [] };
	}

	const linkedRowIds = linkedRows.map((row) => row.id);
	const existingRows = await ctx.store.findMany<Record<string, unknown>>(
		'daily_assignments',
		ctx.auth.orgId,
		undefined,
		{
			inFilters: { id: linkedRowIds },
			select: 'id'
		}
	);
	const deletedIds = existingRows
		.map((row) => row.id)
		.filter((id): id is string => typeof id === 'string' && linkedRowIds.includes(id));

	const deletedCount = await ctx.store.deleteManyByIds('daily_assignments', ctx.auth.orgId, deletedIds);
	return { cleared: deletedCount, deletedIds };
}

export async function cleanupAcceptedDutyRosterRunCalendarAssignmentsForInvalidation(
	ctx: WritePorts,
	targets: AcceptedDutyRosterRunInvalidationCalendarCleanupTarget[]
): Promise<AcceptedDutyRosterRunInvalidationCalendarCleanupResult> {
	const removedCalendarAssignmentCountByRunId = new Map<string, number>();
	const calendarAssignmentsEditedByRunId = new Map(
		targets.map((target) => [
			target.run.id,
			acceptedDutyRosterRunCalendarAssignmentsWereEdited(target.run, target.linkedRows)
		])
	);
	const removedCalendarRows: DutyRosterTemplateLinkedCalendarAssignmentRow[] = [];
	let removedCalendarAssignments = 0;

	try {
		for (const target of targets) {
			const targetRemoval = await removeAcceptedDutyRosterRunLinkedCalendarAssignments(
				ctx,
				target.run.id,
				target.linkedRows
			);
			const deletedIdSet = new Set(targetRemoval.deletedIds);
			removedCalendarRows.push(...target.linkedRows.filter((row) => deletedIdSet.has(row.id)));
			removedCalendarAssignmentCountByRunId.set(target.run.id, targetRemoval.cleared);
			removedCalendarAssignments += targetRemoval.cleared;
		}
	} catch (error) {
		await tryRestoreLinkedCalendarAssignments(ctx, removedCalendarRows, error);
		throw error;
	}

	return {
		removedCalendarAssignments,
		removedCalendarAssignmentCountByRunId,
		calendarAssignmentsEditedByRunId,
		calendarAssignmentsEdited: [...calendarAssignmentsEditedByRunId.values()].some(Boolean)
	};
}

export async function hydrateAcceptedDutyRosterRunCalendarSyncState(
	ctx: QueryPorts,
	runs: DutyRosterTemplateAcceptedRun[]
): Promise<DutyRosterTemplateAcceptedRun[]> {
	const appliedRunIds = runs.filter((run) => run.appliedAt).map((run) => run.id);
	if (appliedRunIds.length === 0) {
		return runs;
	}

	const rowsByRunId = await loadAcceptedDutyRosterRunCalendarAssignmentsByRunId(
		ctx,
		runs.filter((run) => appliedRunIds.includes(run.id))
	);

	return runs.map((run) => {
		const runRows = rowsByRunId.get(run.id) ?? [];
		const calendarSyncState = buildAcceptedDutyRosterRunCalendarSyncState(run, runRows);
		const linkedRows = linkedRowsForRun(runRows, run.id);
		return {
			...run,
			linkedCalendarAssignmentCount: linkedRows.length,
			calendarAssignmentsEdited: calendarSyncState.status !== 'not-applied' && calendarSyncState.status !== 'in-sync',
			calendarSyncState
		};
	});
}

export async function logAcceptedDutyRosterRunAppliedToCalendar(
	ctx: WritePorts,
	runId: string,
	details: { inserted: number; cleared: number }
): Promise<void> {
	await ctx.audit.log({
		action: 'duty_roster_template_run.applied_to_calendar',
		resourceType: 'duty_roster_template_run',
		resourceId: runId,
		details
	});
}

export async function logAcceptedDutyRosterRunInvalidated(
	ctx: WritePorts,
	runId: string,
	details: { removedCalendarAssignments: number; calendarAssignmentsEdited: boolean }
): Promise<void> {
	await ctx.audit.log({
		action: 'duty_roster_template_run.invalidated',
		resourceType: 'duty_roster_template_run',
		resourceId: runId,
		details
	});
}

async function loadDutyRosterCorrectionCooldownHours(ctx: QueryPorts, assignmentTypeId: string): Promise<number> {
	const row = await ctx.store.findOne<Record<string, unknown>>('assignment_types', ctx.auth.orgId, {
		id: assignmentTypeId
	});
	return normalizeDutyRosterCooldownHours(row?.cooldown_hours);
}

function normalizeDutyRosterCooldownHours(value: unknown): number {
	const cooldown = typeof value === 'number' ? value : Number(value ?? 0);
	if (!Number.isFinite(cooldown) || cooldown <= 0) {
		return 0;
	}
	return Math.min(Math.floor(cooldown), MAX_DUTY_ROSTER_COOLDOWN_HOURS);
}

function buildCalendarSyncPlanChanges(
	run: DutyRosterTemplateAcceptedRun,
	rows: DutyRosterTemplateCalendarAssignmentRow[]
): AcceptedDutyRosterRunCalendarSyncPlanChange[] {
	const expected = expectedCalendarAssignmentsByRowDate(run);
	const linkedRows = linkedRowsForRun(rows, run.id);
	const linkedRowsByRowDate = linkedRowsBySourceRowDate(linkedRows);
	const rowsByCoordinate = calendarRowsByCoordinate(rows);
	const snapshot = parseAcceptedRunSnapshot(run.snapshotPayload);
	const finalRowsByDate = new Map(snapshot.finalRows.map((row) => [row.date, row]));
	const primaryLinkedRowIds = new Set<string>();
	const changes: AcceptedDutyRosterRunCalendarSyncPlanChange[] = [];

	for (const finalRow of snapshot.finalRows) {
		const expectedRow = expected.get(finalRow.date) ?? {
			assignmentTypeId: snapshot.template.id,
			assigneeId: ''
		};
		const linkedRow =
			choosePrimaryLinkedRow(
				linkedRowsByRowDate.get(finalRow.date) ?? [],
				finalRow.date,
				expectedRow.assignmentTypeId
			) ?? null;
		const currentRow =
			linkedRow ?? rowsByCoordinate.get(calendarCoordinateKey(finalRow.date, expectedRow.assignmentTypeId)) ?? null;
		const correction = latestCorrectionForRunDate(run, finalRow.date);
		const plannedAssigneeId = expectedRow.assigneeId || null;
		if (linkedRow) {
			primaryLinkedRowIds.add(linkedRow.id);
		}

		if (
			linkedRow &&
			linkedRow.date === finalRow.date &&
			linkedRow.assignment_type_id === expectedRow.assignmentTypeId &&
			(linkedRow.assignee_id || null) === plannedAssigneeId
		) {
			continue;
		}

		changes.push({
			id: `${run.id}:${finalRow.date}`,
			date: finalRow.date,
			sourceRowKey: finalRow.date,
			assignmentTypeId: expectedRow.assignmentTypeId,
			action: plannedAssigneeId ? (currentRow ? 'update' : 'create') : 'clear',
			currentAssignmentTypeId: currentRow?.assignment_type_id ?? null,
			currentAssigneeId: currentRow?.assignee_id ?? null,
			currentAssigneeLabel: assigneeLabelForDate(run, finalRow.date, currentRow?.assignee_id ?? null),
			currentSourceLineage: calendarSourceLineage(currentRow),
			plannedAssigneeId,
			plannedAssigneeLabel: assigneeLabelForDate(run, finalRow.date, plannedAssigneeId),
			reason: correction ? `Duty Roster Correction: ${correction.reason}` : 'Accepted Duty Roster Run assignment',
			correctionReason: correction?.reason ?? null
		});
	}

	for (const linkedRow of linkedRows) {
		const rowDate = linkedRow.duty_roster_template_run_row_date ?? linkedRow.date;
		if (finalRowsByDate.has(rowDate) && primaryLinkedRowIds.has(linkedRow.id)) continue;
		changes.push({
			id: `${run.id}:${rowDate}:clear`,
			date: linkedRow.date,
			sourceRowKey: rowDate,
			assignmentTypeId: linkedRow.assignment_type_id,
			action: 'clear',
			currentAssignmentTypeId: linkedRow.assignment_type_id,
			currentAssigneeId: linkedRow.assignee_id,
			currentAssigneeLabel: assigneeLabelForDate(run, rowDate, linkedRow.assignee_id),
			currentSourceLineage: calendarSourceLineage(linkedRow),
			plannedAssigneeId: null,
			plannedAssigneeLabel: null,
			reason: 'Linked Calendar assignment no longer appears in this Accepted Duty Roster Run.',
			correctionReason: null
		});
	}

	return changes;
}

function classifyCalendarSyncStatus(
	run: DutyRosterTemplateAcceptedRun,
	rows: DutyRosterTemplateCalendarAssignmentRow[],
	changes: AcceptedDutyRosterRunCalendarSyncPlanChange[]
): AcceptedDutyRosterRunCalendarSyncStatus {
	if (!run.appliedAt) return 'not-applied';
	if (changes.length === 0) return 'in-sync';

	const expected = expectedCalendarAssignmentsByRowDate(run);
	const linkedRowsByRowDate = linkedRowsBySourceRowDate(linkedRowsForRun(rows, run.id));
	let dutyRosterNewer = false;
	let calendarManual = false;

	for (const change of changes) {
		const correction = latestCorrectionForRunDate(run, change.sourceRowKey);
		const expectedRow = expected.get(change.sourceRowKey);
		const linkedRow = choosePrimaryLinkedRow(
			linkedRowsByRowDate.get(change.sourceRowKey) ?? [],
			change.sourceRowKey,
			expectedRow?.assignmentTypeId ?? change.assignmentTypeId
		);
		const originalAssigneeId = acceptedAssigneeIdForRunDate(run, change.sourceRowKey);
		if (
			correction &&
			expectedRow &&
			linkedRow &&
			linkedRow.date === change.sourceRowKey &&
			linkedRow.assignment_type_id === expectedRow.assignmentTypeId &&
			linkedRow.assignee_id === originalAssigneeId
		) {
			dutyRosterNewer = true;
		} else {
			calendarManual = true;
		}
	}

	if (dutyRosterNewer && calendarManual) return 'needs-review';
	if (dutyRosterNewer) return 'duty-roster-newer';
	return 'calendar-manually-changed';
}

function linkedRowsBySourceRowDate(
	rows: DutyRosterTemplateLinkedCalendarAssignmentRow[]
): Map<string, DutyRosterTemplateLinkedCalendarAssignmentRow[]> {
	const byRowDate = new Map<string, DutyRosterTemplateLinkedCalendarAssignmentRow[]>();
	for (const row of rows) {
		const rowDate = row.duty_roster_template_run_row_date ?? row.date;
		const runRows = byRowDate.get(rowDate) ?? [];
		runRows.push(row);
		byRowDate.set(rowDate, runRows);
	}
	return byRowDate;
}

function choosePrimaryLinkedRow(
	rows: DutyRosterTemplateLinkedCalendarAssignmentRow[],
	date: string,
	assignmentTypeId: string
): DutyRosterTemplateLinkedCalendarAssignmentRow | null {
	return rows.find((row) => row.date === date && row.assignment_type_id === assignmentTypeId) ?? null;
}

async function loadAcceptedDutyRosterRunCalendarAssignmentsByRunId(
	ctx: QueryPorts,
	runs: DutyRosterTemplateAcceptedRun[]
): Promise<Map<string, DutyRosterTemplateCalendarAssignmentRow[]>> {
	const rowsByRunId = new Map(runs.map((run) => [run.id, [] as DutyRosterTemplateCalendarAssignmentRow[]]));
	const appliedRuns = runs.filter((run) => run.appliedAt);
	if (appliedRuns.length === 0) {
		return rowsByRunId;
	}

	const linkedRowsByRunId = await loadAcceptedDutyRosterRunLinkedCalendarAssignmentsByRunId(
		ctx,
		appliedRuns.map(runToRow)
	);
	for (const run of appliedRuns) {
		for (const row of linkedRowsByRunId.get(run.id) ?? []) {
			appendUniqueCalendarRow(rowsByRunId, run.id, row);
		}
	}

	const coordinatesByRunId = calendarCoordinatesByRunId(appliedRuns);
	const dates = [...new Set([...coordinatesByRunId.values()].flatMap((coordinates) => [...coordinates.keys()]))];
	const assignmentTypeIds = [
		...new Set(appliedRuns.map((run) => parseAcceptedRunSnapshot(run.snapshotPayload).template.id))
	];

	if (dates.length === 0 || assignmentTypeIds.length === 0) {
		return rowsByRunId;
	}

	const liveRows = await ctx.store.findMany<DutyRosterTemplateCalendarAssignmentRow>(
		'daily_assignments',
		ctx.auth.orgId,
		{},
		{
			inFilters: { date: dates, assignment_type_id: assignmentTypeIds },
			select:
				'id, duty_roster_template_run_id, duty_roster_template_run_row_date, date, assignment_type_id, assignee_id'
		}
	);

	for (const liveRow of liveRows) {
		const coordinateKey = calendarCoordinateKey(liveRow.date, liveRow.assignment_type_id);
		for (const [runId, coordinates] of coordinatesByRunId) {
			if (coordinates.has(liveRow.date) && coordinates.get(liveRow.date) === coordinateKey) {
				appendUniqueCalendarRow(rowsByRunId, runId, liveRow);
			}
		}
	}

	return rowsByRunId;
}

function runToRow(run: DutyRosterTemplateAcceptedRun): DutyRosterTemplateRunRow {
	return {
		id: run.id,
		organization_id: '',
		template_id: run.templateId,
		template_name: run.templateName,
		status: run.status,
		start_date: run.startDate,
		end_date: run.endDate,
		snapshot_payload: run.snapshotPayload,
		accepted_by_user_id: run.acceptedByUserId,
		accepted_at: run.acceptedAt,
		applied_by_user_id: run.appliedByUserId,
		applied_at: run.appliedAt,
		invalidated_by_user_id: run.invalidatedByUserId,
		invalidated_at: run.invalidatedAt,
		created_at: run.createdAt
	};
}

function appendUniqueCalendarRow(
	rowsByRunId: Map<string, DutyRosterTemplateCalendarAssignmentRow[]>,
	runId: string,
	row: DutyRosterTemplateCalendarAssignmentRow
): void {
	const rows = rowsByRunId.get(runId) ?? [];
	if (!rows.some((existing) => existing.id === row.id)) {
		rows.push(row);
	}
	rowsByRunId.set(runId, rows);
}

function calendarCoordinatesByRunId(runs: DutyRosterTemplateAcceptedRun[]): Map<string, Map<string, string>> {
	const byRunId = new Map<string, Map<string, string>>();
	for (const run of runs) {
		const snapshot = parseAcceptedRunSnapshot(run.snapshotPayload);
		byRunId.set(
			run.id,
			new Map(snapshot.finalRows.map((row) => [row.date, calendarCoordinateKey(row.date, snapshot.template.id)]))
		);
	}
	return byRunId;
}

function linkedRowsForRun(
	rows: DutyRosterTemplateCalendarAssignmentRow[],
	runId: string
): DutyRosterTemplateLinkedCalendarAssignmentRow[] {
	return rows.filter(
		(row): row is DutyRosterTemplateLinkedCalendarAssignmentRow => row.duty_roster_template_run_id === runId
	);
}

function calendarRowsByCoordinate(
	rows: DutyRosterTemplateCalendarAssignmentRow[]
): Map<string, DutyRosterTemplateCalendarAssignmentRow> {
	return new Map(rows.map((row) => [calendarCoordinateKey(row.date, row.assignment_type_id), row]));
}

function calendarCoordinateKey(date: string, assignmentTypeId: string): string {
	return `${date}:${assignmentTypeId}`;
}

function calendarSourceLineage(
	row: DutyRosterTemplateCalendarAssignmentRow | null
): AcceptedDutyRosterRunCalendarSyncPlanChange['currentSourceLineage'] {
	if (!row?.duty_roster_template_run_id) return null;
	return {
		sourceKind: 'duty-roster-run',
		sourceId: row.duty_roster_template_run_id,
		sourceRowKey: row.duty_roster_template_run_row_date ?? row.date
	};
}

function calendarSyncStatusLabel(status: AcceptedDutyRosterRunCalendarSyncStatus): string {
	if (status === 'not-applied') return 'Not applied';
	if (status === 'in-sync') return 'In sync';
	if (status === 'duty-roster-newer') return 'Duty Roster is newer than Calendar';
	if (status === 'calendar-manually-changed') return 'Calendar was manually changed';
	return 'Calendar sync needs review';
}

function calendarSyncStatusSummary(status: AcceptedDutyRosterRunCalendarSyncStatus, changeCount: number): string {
	if (status === 'not-applied') return 'This accepted run has not been applied to Calendar.';
	if (status === 'in-sync') return 'Calendar matches this accepted Duty Roster Run.';
	if (status === 'duty-roster-newer') {
		return `${changeCount} Calendar ${changeCount === 1 ? 'assignment needs' : 'assignments need'} the latest Duty Roster Correction.`;
	}
	if (status === 'calendar-manually-changed') {
		return `${changeCount} linked Calendar ${changeCount === 1 ? 'assignment differs' : 'assignments differ'} from this accepted run. Review before overwriting.`;
	}
	return `${changeCount} linked Calendar ${changeCount === 1 ? 'assignment needs' : 'assignments need'} review before reapply.`;
}

function planToken(changes: AcceptedDutyRosterRunCalendarSyncPlanChange[]): string {
	const payload = changes.map((change) => ({
		id: change.id,
		date: change.date,
		assignmentTypeId: change.assignmentTypeId,
		action: change.action,
		sourceRowKey: change.sourceRowKey,
		currentAssignmentTypeId: change.currentAssignmentTypeId ?? null,
		currentAssigneeId: change.currentAssigneeId,
		currentSourceLineage: change.currentSourceLineage ?? null,
		plannedAssigneeId: change.plannedAssigneeId,
		reason: change.reason
	}));
	return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function latestCorrectionForRunDate(
	run: DutyRosterTemplateAcceptedRun,
	date: string
): DutyRosterTemplateRunCorrection | null {
	return run.corrections.filter((correction) => correction.runRowDate === date).at(-1) ?? null;
}

function acceptedAssigneeIdForRunDate(run: DutyRosterTemplateAcceptedRun, date: string): string | null {
	const snapshot = parseAcceptedRunSnapshot(run.snapshotPayload);
	return snapshot.finalRows.find((row) => row.date === date)?.finalAssigneeId ?? null;
}

function assigneeLabelForDate(
	run: DutyRosterTemplateAcceptedRun,
	date: string,
	assigneeId: string | null
): string | null {
	if (!assigneeId) return null;
	const correction = latestCorrectionForRunDate(run, date);
	if (correction?.replacementAssigneeId === assigneeId) return personDisplayLabel(correction.replacementDisplay);
	if (correction?.originalAssigneeId === assigneeId) return personDisplayLabel(correction.originalDisplay);

	const snapshot = parseAcceptedRunSnapshot(run.snapshotPayload);
	const finalRow = snapshot.finalRows.find((row) => row.date === date);
	if (finalRow?.finalAssigneeId === assigneeId) return personDisplayLabel(finalRow.finalDisplay);
	if (finalRow?.generatedAssigneeId === assigneeId) return personDisplayLabel(finalRow.generatedDisplay);
	const personnel = (snapshot.selectionPersonnel ?? []).find((person) => person.id === assigneeId);
	return personnel ? personDisplayLabel(personnel) : assigneeId;
}

function personDisplayLabel(display: DutyRosterPoolPersonnelDisplay | null | undefined): string | null {
	return display ? `${display.rank} ${display.lastName}, ${display.firstName}` : null;
}

async function loadDailyAssignmentRollbackRecords(
	ctx: QueryPorts,
	records: DailyAssignmentSlotRecord[]
): Promise<DailyAssignmentSlotRecord[]> {
	const coordinates = [
		...new Map(records.map((record) => [calendarCoordinateKey(record.date, record.assignmentTypeId), record])).values()
	];
	const dates = [...new Set(coordinates.map((record) => record.date))];
	const assignmentTypeIds = [...new Set(coordinates.map((record) => record.assignmentTypeId))];
	if (dates.length === 0 || assignmentTypeIds.length === 0) return [];

	const existingRows = await ctx.store.findMany<DutyRosterTemplateCalendarAssignmentRow>(
		'daily_assignments',
		ctx.auth.orgId,
		{},
		{
			inFilters: { date: dates, assignment_type_id: assignmentTypeIds },
			select:
				'id, duty_roster_template_run_id, duty_roster_template_run_row_date, date, assignment_type_id, assignee_id'
		}
	);
	const existingRowsByCoordinate = calendarRowsByCoordinate(existingRows);
	return coordinates.map((record) => {
		const existingRow =
			existingRowsByCoordinate.get(calendarCoordinateKey(record.date, record.assignmentTypeId)) ?? null;
		if (!existingRow?.assignee_id) {
			return {
				date: record.date,
				assignmentTypeId: record.assignmentTypeId,
				assigneeId: '',
				sourceLineage: null
			};
		}

		return {
			date: existingRow.date,
			assignmentTypeId: existingRow.assignment_type_id,
			assigneeId: existingRow.assignee_id,
			sourceLineage: calendarSourceLineage(existingRow)
		};
	});
}

function planChangeToDailyAssignmentRecord(
	change: AcceptedDutyRosterRunCalendarSyncPlanChange,
	runId: string
): DailyAssignmentSlotRecord {
	return {
		date: change.date,
		assignmentTypeId: assignmentTypeIdFromPlanChange(change),
		assigneeId: change.plannedAssigneeId ?? '',
		sourceLineage: change.plannedAssigneeId
			? {
					sourceKind: 'duty-roster-run',
					sourceId: runId,
					sourceRowKey: change.sourceRowKey
				}
			: null
	};
}

function rollbackRecordFromPlanChange(change: AcceptedDutyRosterRunCalendarSyncPlanChange): DailyAssignmentSlotRecord {
	return {
		date: change.date,
		assignmentTypeId: change.currentAssignmentTypeId ?? assignmentTypeIdFromPlanChange(change),
		assigneeId: change.currentAssigneeId ?? '',
		sourceLineage: change.currentAssigneeId ? (change.currentSourceLineage ?? null) : null
	};
}

function assignmentTypeIdFromPlanChange(change: AcceptedDutyRosterRunCalendarSyncPlanChange): string {
	return change.assignmentTypeId;
}

async function tryLogAcceptedDutyRosterRunAppliedToCalendar(
	ctx: WritePorts,
	runId: string,
	details: { inserted: number; cleared: number }
): Promise<void> {
	try {
		await logAcceptedDutyRosterRunAppliedToCalendar(ctx, runId, details);
	} catch {
		// Calendar writes and the accepted-run applied marker are already durable; do not roll them back for audit failure.
	}
}

async function restoreLinkedCalendarAssignments(
	ctx: WritePorts,
	rows: DutyRosterTemplateLinkedCalendarAssignmentRow[]
): Promise<void> {
	if (rows.length === 0) return;
	await ctx.store.insertMany(
		'daily_assignments',
		ctx.auth.orgId,
		rows.map((row) => ({
			id: row.id,
			date: row.date,
			assignment_type_id: row.assignment_type_id,
			assignee_id: row.assignee_id,
			duty_roster_template_run_id: row.duty_roster_template_run_id,
			duty_roster_template_run_row_date: row.duty_roster_template_run_row_date
		}))
	);
}

async function tryRestoreLinkedCalendarAssignments(
	ctx: WritePorts,
	rows: DutyRosterTemplateLinkedCalendarAssignmentRow[],
	primaryError: unknown
): Promise<void> {
	try {
		await restoreLinkedCalendarAssignments(ctx, rows);
	} catch (restoreError) {
		throw calendarRollbackFailureError(
			'Failed to restore linked Calendar assignments after invalidation cleanup failure',
			primaryError,
			restoreError
		);
	}
}

async function tryRollbackReviewedCalendarSyncPlan(
	ctx: WritePorts,
	records: DailyAssignmentSlotRecord[],
	primaryError: unknown,
	message: string
): Promise<void> {
	await tryRollbackCalendarSyncRecords(ctx, records, primaryError, message);
}

async function tryRollbackCalendarSyncRecords(
	ctx: WritePorts,
	records: DailyAssignmentSlotRecord[],
	primaryError: unknown,
	message: string
): Promise<void> {
	if (records.length === 0) return;
	try {
		await batchDailyAssignments(ctx, { records });
	} catch (rollbackError) {
		throw calendarRollbackFailureError(message, primaryError, rollbackError);
	}
}

function calendarRollbackFailureError(message: string, primaryError: unknown, rollbackError: unknown): Error {
	const error = new Error(
		`${message}. Primary failure: ${errorMessage(primaryError)}. Rollback failure: ${errorMessage(rollbackError)}.`
	);
	return Object.assign(error, { primaryError, rollbackError });
}

function errorMessage(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.replace(/[.]+$/, '');
}
