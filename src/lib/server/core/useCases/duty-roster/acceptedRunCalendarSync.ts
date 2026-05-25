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

export type AcceptedDutyRosterRunCalendarSyncApplyResult = {
	acceptedRun: DutyRosterTemplateAcceptedRun;
	insertedCount: number;
	clearedCount: number;
};

export async function applyAcceptedDutyRosterRunCalendarSync(
	ctx: WritePorts,
	run: DutyRosterTemplateAcceptedRun,
	options: { audit?: boolean } = {}
): Promise<AcceptedDutyRosterRunCalendarSyncApplyResult> {
	const result = await batchDailyAssignments(ctx, {
		records: applyRecordsFromAcceptedRun(run)
	});
	const appliedAt = new Date().toISOString();
	const updated = await ctx.store.update<DutyRosterTemplateRunRow>(
		DUTY_ROSTER_TEMPLATE_RUN_TABLE,
		ctx.auth.orgId,
		run.id,
		{
			applied_at: appliedAt,
			applied_by_user_id: ctx.auth.userId
		}
	);

	if (options.audit !== false) {
		await logAcceptedDutyRosterRunAppliedToCalendar(ctx, run.id, {
			inserted: result.inserted.length,
			cleared: result.cleared
		});
	}

	return {
		acceptedRun: toAcceptedDutyRosterTemplateRun(updated),
		insertedCount: result.inserted.length,
		clearedCount: result.cleared
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

	const rollbackRecords = plan.changes.map((change) => rollbackRecordFromPlanChange(change, run.id));
	let result: Awaited<ReturnType<typeof batchDailyAssignments>>;
	try {
		result = await batchDailyAssignments(ctx, {
			records: plan.changes.map((change) => planChangeToDailyAssignmentRecord(change, run.id))
		});
	} catch (error) {
		await tryRollbackReviewedCalendarSyncPlan(ctx, rollbackRecords);
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

		await logAcceptedDutyRosterRunAppliedToCalendar(ctx, run.id, {
			inserted: result.inserted.length,
			cleared: result.cleared
		});

		return {
			acceptedRun: toAcceptedDutyRosterTemplateRun(updated),
			insertedCount: result.inserted.length,
			clearedCount: result.cleared
		};
	} catch (error) {
		await tryRollbackReviewedCalendarSyncPlan(ctx, rollbackRecords);
		throw error;
	}
}

export async function rollbackAcceptedDutyRosterRunCalendarSync(ctx: WritePorts, runId: string): Promise<void> {
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
	rows: DutyRosterTemplateLinkedCalendarAssignmentRow[]
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
	const linkedCount = rows.length;
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
	const rowsByRunId = await loadAcceptedDutyRosterRunLinkedCalendarAssignmentsByRunId(ctx, [
		{
			id: run.id,
			organization_id: ctx.auth.orgId,
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
		}
	]);
	return buildAcceptedDutyRosterRunCalendarSyncState(run, rowsByRunId.get(run.id) ?? []);
}

export async function removeAcceptedDutyRosterRunLinkedCalendarAssignments(
	ctx: WritePorts,
	linkedRows: DutyRosterTemplateLinkedCalendarAssignmentRow[]
): Promise<{ cleared: number }> {
	if (linkedRows.length === 0) {
		return { cleared: 0 };
	}

	const result = await batchDailyAssignments(ctx, {
		records: linkedRows.map((assignment) => ({
			date: assignment.date,
			assignmentTypeId: assignment.assignment_type_id,
			assigneeId: ''
		}))
	});
	// `cleared` is the number of requested slot removals; the batch API does not expose actual deleted row count.
	return { cleared: result.cleared };
}

export async function hydrateAcceptedDutyRosterRunCalendarSyncState(
	ctx: QueryPorts,
	runs: DutyRosterTemplateAcceptedRun[]
): Promise<DutyRosterTemplateAcceptedRun[]> {
	const appliedRunIds = runs.filter((run) => run.appliedAt).map((run) => run.id);
	if (appliedRunIds.length === 0) {
		return runs;
	}

	const rows = await ctx.store.findMany<DutyRosterTemplateLinkedCalendarAssignmentRow>(
		'daily_assignments',
		ctx.auth.orgId,
		{},
		{
			inFilters: { duty_roster_template_run_id: appliedRunIds },
			select:
				'id, duty_roster_template_run_id, duty_roster_template_run_row_date, date, assignment_type_id, assignee_id'
		}
	);
	const rowsByRunId = new Map<string, DutyRosterTemplateLinkedCalendarAssignmentRow[]>();
	for (const row of rows) {
		const runRows = rowsByRunId.get(row.duty_roster_template_run_id) ?? [];
		runRows.push(row);
		rowsByRunId.set(row.duty_roster_template_run_id, runRows);
	}

	return runs.map((run) => {
		const runRows = rowsByRunId.get(run.id) ?? [];
		const calendarSyncState = buildAcceptedDutyRosterRunCalendarSyncState(run, runRows);
		return {
			...run,
			linkedCalendarAssignmentCount: runRows.length,
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
	rows: DutyRosterTemplateLinkedCalendarAssignmentRow[]
): AcceptedDutyRosterRunCalendarSyncPlanChange[] {
	const expected = expectedCalendarAssignmentsByRowDate(run);
	const linkedRowsByRowDate = linkedRowsBySourceRowDate(rows);
	const snapshot = parseAcceptedRunSnapshot(run.snapshotPayload);
	const finalRowsByDate = new Map(snapshot.finalRows.map((row) => [row.date, row]));
	const changes: AcceptedDutyRosterRunCalendarSyncPlanChange[] = [];

	for (const finalRow of snapshot.finalRows) {
		const expectedRow = expected.get(finalRow.date) ?? {
			assignmentTypeId: snapshot.template.id,
			assigneeId: ''
		};
		const linkedRow = linkedRowsByRowDate.get(finalRow.date) ?? null;
		const correction = latestCorrectionForRunDate(run, finalRow.date);
		const plannedAssigneeId = expectedRow.assigneeId || null;

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
			assignmentTypeId: expectedRow.assignmentTypeId,
			action: plannedAssigneeId ? (linkedRow ? 'update' : 'create') : 'clear',
			currentAssigneeId: linkedRow?.assignee_id ?? null,
			currentAssigneeLabel: assigneeLabelForDate(run, finalRow.date, linkedRow?.assignee_id ?? null),
			plannedAssigneeId,
			plannedAssigneeLabel: assigneeLabelForDate(run, finalRow.date, plannedAssigneeId),
			reason: correction ? `Duty Roster Correction: ${correction.reason}` : 'Accepted Duty Roster Run assignment',
			correctionReason: correction?.reason ?? null
		});
	}

	for (const linkedRow of rows) {
		const rowDate = linkedRow.duty_roster_template_run_row_date ?? linkedRow.date;
		if (finalRowsByDate.has(rowDate)) continue;
		changes.push({
			id: `${run.id}:${rowDate}:clear`,
			date: linkedRow.date,
			assignmentTypeId: linkedRow.assignment_type_id,
			action: 'clear',
			currentAssigneeId: linkedRow.assignee_id,
			currentAssigneeLabel: assigneeLabelForDate(run, rowDate, linkedRow.assignee_id),
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
	rows: DutyRosterTemplateLinkedCalendarAssignmentRow[],
	changes: AcceptedDutyRosterRunCalendarSyncPlanChange[]
): AcceptedDutyRosterRunCalendarSyncStatus {
	if (!run.appliedAt) return 'not-applied';
	if (changes.length === 0) return 'in-sync';

	const expected = expectedCalendarAssignmentsByRowDate(run);
	const linkedRowsByRowDate = linkedRowsBySourceRowDate(rows);
	let dutyRosterNewer = false;
	let calendarManual = false;

	for (const change of changes) {
		const correction = latestCorrectionForRunDate(run, change.date);
		const expectedRow = expected.get(change.date);
		const linkedRow = linkedRowsByRowDate.get(change.date);
		const originalAssigneeId = acceptedAssigneeIdForRunDate(run, change.date);
		if (
			correction &&
			expectedRow &&
			linkedRow &&
			linkedRow.date === change.date &&
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
): Map<string, DutyRosterTemplateLinkedCalendarAssignmentRow> {
	return new Map(rows.map((row) => [row.duty_roster_template_run_row_date ?? row.date, row]));
}

function calendarSyncStatusLabel(status: AcceptedDutyRosterRunCalendarSyncStatus): string {
	if (status === 'not-applied') return 'Not applied';
	if (status === 'in-sync') return 'In sync';
	if (status === 'duty-roster-newer') return 'Duty Roster newer';
	if (status === 'calendar-manually-changed') return 'Calendar manually changed';
	return 'Needs review';
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
		currentAssigneeId: change.currentAssigneeId,
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
					sourceRowKey: sourceRowKeyFromPlanChange(change, runId)
				}
			: null
	};
}

function rollbackRecordFromPlanChange(
	change: AcceptedDutyRosterRunCalendarSyncPlanChange,
	runId: string
): DailyAssignmentSlotRecord {
	return {
		date: change.date,
		assignmentTypeId: assignmentTypeIdFromPlanChange(change),
		assigneeId: change.currentAssigneeId ?? '',
		sourceLineage: change.currentAssigneeId
			? {
					sourceKind: 'duty-roster-run',
					sourceId: runId,
					sourceRowKey: sourceRowKeyFromPlanChange(change, runId)
				}
			: null
	};
}

function assignmentTypeIdFromPlanChange(change: AcceptedDutyRosterRunCalendarSyncPlanChange): string {
	return change.assignmentTypeId;
}

function sourceRowKeyFromPlanChange(change: AcceptedDutyRosterRunCalendarSyncPlanChange, runId: string): string {
	return change.id.replace(`${runId}:`, '').replace(':clear', '');
}

async function tryRollbackReviewedCalendarSyncPlan(
	ctx: WritePorts,
	records: DailyAssignmentSlotRecord[]
): Promise<void> {
	try {
		await batchDailyAssignments(ctx, { records });
	} catch {
		// Preserve the original failure; the caller needs the primary write error.
	}
}
