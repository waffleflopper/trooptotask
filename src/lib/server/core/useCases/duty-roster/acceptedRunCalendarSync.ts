import type { QueryPorts, WritePorts } from '$lib/server/core/ports';
import type { DutyRosterTemplateAcceptedRun } from '$features/duty-roster/templates/dutyRosterTemplates';
import { batchDailyAssignments } from '../dailyAssignmentsBatch';
import {
	applyRecordsFromAcceptedRun,
	linkedCalendarAssignmentsWereEdited,
	toAcceptedDutyRosterTemplateRun,
	type DutyRosterTemplateLinkedCalendarAssignmentRow,
	type DutyRosterTemplateRunRow
} from './acceptedRunRecord';

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
		return {
			...run,
			linkedCalendarAssignmentCount: runRows.length,
			calendarAssignmentsEdited: acceptedDutyRosterRunCalendarAssignmentsWereEdited(run, runRows)
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
