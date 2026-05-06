import { fail } from '$lib/server/core/errors';
import type { QueryPorts, WritePorts } from '$lib/server/core/ports';
import type {
	DutyRosterPoolPersonnel,
	DutyRosterTemplate,
	DutyRosterTemplateAcceptedRun,
	DutyRosterTemplateCountReadModel,
	DutyRosterTemplateCorrectionInput,
	DutyRosterTemplateRunCorrection
} from '$features/duty-roster/templates/dutyRosterTemplates';
import { resolveDutyRosterPool } from '$features/duty-roster/templates/dutyRosterPool';
import {
	buildDutyRosterCountSource,
	type DutyRosterCountSourceModel,
	type DutyRosterCountSourceRun
} from '$features/duty-roster/templates/dutyRosterCountSource';
import {
	buildDutyRosterTemplateAcceptedSnapshot,
	type DutyRosterTemplatePreview
} from '$features/duty-roster/templates/dutyRosterTemplatePreview';
import { batchDailyAssignments } from '../dailyAssignmentsBatch';
import {
	acceptedRunSnapshot,
	applyRecordsFromAcceptedRun,
	linkedCalendarAssignmentsWereEdited,
	toAcceptedDutyRosterTemplateRun,
	type DutyRosterTemplateLinkedCalendarAssignmentRow,
	type DutyRosterTemplateRunRow
} from './acceptedRunRecord';
import {
	hydrateAcceptedRunCorrections,
	loadDutyRosterRunCorrectionsByRunId,
	recordDutyRosterTemplateRunCorrection as recordDutyRosterCorrectionLifecycle
} from './dutyRosterCorrection';

const DUTY_ROSTER_TEMPLATE_RUN_TABLE = 'duty_roster_template_runs';

export type DutyRosterTemplateApplyResult = {
	acceptedRun: DutyRosterTemplateAcceptedRun;
	insertedCount: number;
	clearedCount: number;
};

export type DutyRosterTemplateInvalidateResult = {
	invalidatedRun: DutyRosterTemplateAcceptedRun;
	removedCalendarAssignments: number;
	calendarAssignmentsEdited: boolean;
};

export type AcceptedDutyRosterRunCountSource = DutyRosterTemplateCountReadModel & {
	continuationHistory: DutyRosterCountSourceModel['continuationHistory'];
};

export async function listAcceptedDutyRosterTemplateRuns(
	ctx: QueryPorts,
	templateId: string
): Promise<DutyRosterTemplateAcceptedRun[]> {
	const rows = await ctx.store.findMany<DutyRosterTemplateRunRow>(
		DUTY_ROSTER_TEMPLATE_RUN_TABLE,
		ctx.auth.orgId,
		{ template_id: templateId },
		{
			inFilters: { status: ['accepted', 'invalidated'] },
			orderBy: [{ column: 'accepted_at', ascending: false }]
		}
	);

	const runsWithCorrections = await hydrateAcceptedRunActorDisplayNames(
		ctx,
		await hydrateAcceptedRunCorrections(ctx, rows.map(toAcceptedDutyRosterTemplateRun))
	);
	return hydrateAcceptedRunCalendarState(ctx, runsWithCorrections);
}

type OrganizationMembershipActorRow = {
	user_id: string;
	email: string | null;
};

async function hydrateAcceptedRunActorDisplayNames(
	ctx: QueryPorts,
	runs: DutyRosterTemplateAcceptedRun[]
): Promise<DutyRosterTemplateAcceptedRun[]> {
	const actorIds = [...new Set(runs.map((run) => run.acceptedByUserId).filter((id): id is string => Boolean(id)))];
	if (actorIds.length === 0) return runs;

	const membershipRows = await ctx.store.findMany<OrganizationMembershipActorRow>(
		'organization_memberships',
		ctx.auth.orgId,
		{},
		{
			select: 'user_id,email',
			inFilters: { user_id: actorIds }
		}
	);
	const displayByUserId = new Map(membershipRows.map((row) => [row.user_id, actorDisplayName(row.email, row.user_id)]));

	return runs.map((run) => ({
		...run,
		acceptedByDisplayName: run.acceptedByUserId ? (displayByUserId.get(run.acceptedByUserId) ?? null) : null
	}));
}

function actorDisplayName(email: string | null, fallbackUserId: string): string {
	const normalized = email?.trim();
	if (!normalized) return fallbackUserId;
	return normalized;
}

export async function hasAcceptedDutyRosterTemplateRun(ctx: QueryPorts, templateId: string): Promise<boolean> {
	const rows = await ctx.store.findMany<{ id: string }>(
		DUTY_ROSTER_TEMPLATE_RUN_TABLE,
		ctx.auth.orgId,
		{ template_id: templateId, status: 'accepted' },
		{ select: 'id', limit: 1 }
	);

	return rows.length > 0;
}

export async function loadAcceptedDutyRosterRunCountSource(
	ctx: QueryPorts,
	input: {
		template: DutyRosterTemplate;
		personnel: DutyRosterPoolPersonnel[];
		baselineStartDate?: string;
	}
): Promise<AcceptedDutyRosterRunCountSource> {
	const runRows = await ctx.store.findMany<DutyRosterTemplateRunRow>(
		DUTY_ROSTER_TEMPLATE_RUN_TABLE,
		ctx.auth.orgId,
		{ template_id: input.template.id },
		{
			inFilters: { status: ['accepted', 'invalidated'] },
			orderBy: [{ column: 'accepted_at', ascending: true }]
		}
	);
	const correctionsByRunId = await loadDutyRosterRunCorrectionsByRunId(
		ctx,
		runRows.map((row) => row.id)
	);
	const resolvedPool = resolveDutyRosterPool({
		criteria: input.template.poolCriteria,
		personnel: input.personnel
	}).filter((person) => !input.template.exemptPersonnelIds.includes(person.id));
	const runs: DutyRosterCountSourceRun[] = runRows.map((row) => ({
		id: row.id,
		status: row.status,
		acceptedAt: row.accepted_at,
		snapshot: acceptedRunSnapshot(row),
		corrections: (correctionsByRunId.get(row.id) ?? []).map((correction) => ({
			runRowDate: correction.run_row_date,
			replacementAssigneeId: correction.replacement_assignee_id,
			reason: correction.reason
		}))
	}));

	return buildDutyRosterCountSource({
		template: input.template,
		resolvedPool,
		runs,
		baselineStartDate: input.baselineStartDate
	});
}

export async function acceptReviewedDutyRosterTemplatePreview(
	ctx: WritePorts,
	input: { preview: DutyRosterTemplatePreview; acceptedAt?: string }
): Promise<DutyRosterTemplateAcceptedRun> {
	const acceptedRun = await insertAcceptedDutyRosterTemplatePreview(ctx, input);

	await logAcceptedDutyRosterTemplateRun(ctx, acceptedRun.id);

	return acceptedRun;
}

async function insertAcceptedDutyRosterTemplatePreview(
	ctx: WritePorts,
	input: { preview: DutyRosterTemplatePreview; acceptedAt?: string }
): Promise<DutyRosterTemplateAcceptedRun> {
	const acceptedAt = input.acceptedAt ?? new Date().toISOString();
	const snapshot = buildDutyRosterTemplateAcceptedSnapshot({
		preview: input.preview,
		acceptedAt,
		acceptedByUserId: ctx.auth.userId
	});
	const inserted = await ctx.store.insert<DutyRosterTemplateRunRow>(DUTY_ROSTER_TEMPLATE_RUN_TABLE, ctx.auth.orgId, {
		template_id: input.preview.assignmentType.id,
		template_name: input.preview.assignmentType.name,
		status: 'accepted',
		start_date: input.preview.config.startDate,
		end_date: input.preview.config.endDate,
		snapshot_payload: snapshot as unknown as Record<string, unknown>,
		accepted_by_user_id: ctx.auth.userId,
		accepted_at: acceptedAt,
		created_at: acceptedAt
	});

	return toAcceptedDutyRosterTemplateRun(inserted);
}

async function logAcceptedDutyRosterTemplateRun(ctx: WritePorts, runId: string): Promise<void> {
	await ctx.audit.log({
		action: 'duty_roster_template_run.accepted',
		resourceType: 'duty_roster_template_run',
		resourceId: runId
	});
}

export async function applyAcceptedDutyRosterTemplateRun(
	ctx: WritePorts,
	input: { runId: string }
): Promise<DutyRosterTemplateApplyResult> {
	const row = await ctx.store.findOne<DutyRosterTemplateRunRow>(DUTY_ROSTER_TEMPLATE_RUN_TABLE, ctx.auth.orgId, {
		id: input.runId,
		status: 'accepted'
	});
	if (!row) {
		fail(404, 'Accepted Duty Roster Run not found');
	}

	const [hydrated] = await hydrateAcceptedRunCorrections(ctx, [toAcceptedDutyRosterTemplateRun(row)]);
	return applyAcceptedDutyRosterTemplateRunRecord(ctx, hydrated ?? toAcceptedDutyRosterTemplateRun(row));
}

export async function recordDutyRosterTemplateRunCorrection(
	ctx: WritePorts,
	input: DutyRosterTemplateCorrectionInput
): Promise<DutyRosterTemplateRunCorrection> {
	return recordDutyRosterCorrectionLifecycle(ctx, input);
}

export async function invalidateLatestDutyRosterTemplateRun(
	ctx: WritePorts,
	input: { runId: string }
): Promise<DutyRosterTemplateInvalidateResult> {
	const row = await ctx.store.findOne<DutyRosterTemplateRunRow>(DUTY_ROSTER_TEMPLATE_RUN_TABLE, ctx.auth.orgId, {
		id: input.runId
	});
	if (!row) {
		fail(404, 'Accepted Duty Roster Run not found');
	}
	if (row.status === 'invalidated') {
		fail(400, 'Duty Roster Run is already invalidated.');
	}

	const templateRuns = await ctx.store.findMany<DutyRosterTemplateRunRow>(
		DUTY_ROSTER_TEMPLATE_RUN_TABLE,
		ctx.auth.orgId,
		{ template_id: row.template_id },
		{
			inFilters: { status: ['accepted', 'invalidated'] },
			orderBy: [{ column: 'accepted_at', ascending: false }]
		}
	);
	if (templateRuns[0]?.id !== row.id) {
		fail(400, 'Only the latest Accepted Duty Roster Run can be invalidated.');
	}

	const acceptedRun = toAcceptedDutyRosterTemplateRun(row);
	const linkedRows = row.applied_at
		? await ctx.store.findMany<DutyRosterTemplateLinkedCalendarAssignmentRow>(
				'daily_assignments',
				ctx.auth.orgId,
				{ duty_roster_template_run_id: row.id },
				{
					select:
						'id, duty_roster_template_run_id, duty_roster_template_run_row_date, date, assignment_type_id, assignee_id'
				}
			)
		: [];
	const calendarAssignmentsEdited = linkedCalendarAssignmentsWereEdited(acceptedRun, linkedRows);
	const calendarRemoval =
		linkedRows.length > 0
			? await batchDailyAssignments(ctx, {
					records: linkedRows.map((assignment) => ({
						date: assignment.date,
						assignmentTypeId: assignment.assignment_type_id,
						assigneeId: ''
					}))
				})
			: { inserted: [], cleared: 0 };

	const invalidatedAt = new Date().toISOString();
	const updated = await ctx.store.update<DutyRosterTemplateRunRow>(
		DUTY_ROSTER_TEMPLATE_RUN_TABLE,
		ctx.auth.orgId,
		row.id,
		{
			status: 'invalidated',
			invalidated_at: invalidatedAt,
			invalidated_by_user_id: ctx.auth.userId
		}
	);

	await ctx.audit.log({
		action: 'duty_roster_template_run.invalidated',
		resourceType: 'duty_roster_template_run',
		resourceId: row.id,
		details: {
			removedCalendarAssignments: calendarRemoval.cleared,
			calendarAssignmentsEdited
		}
	});

	return {
		invalidatedRun: toAcceptedDutyRosterTemplateRun(updated),
		removedCalendarAssignments: calendarRemoval.cleared,
		calendarAssignmentsEdited
	};
}

export async function acceptAndApplyDutyRosterTemplatePreview(
	ctx: WritePorts,
	input: { preview: DutyRosterTemplatePreview }
): Promise<DutyRosterTemplateApplyResult> {
	const acceptedRun = await insertAcceptedDutyRosterTemplatePreview(ctx, input);
	let result: DutyRosterTemplateApplyResult;
	try {
		result = await applyAcceptedDutyRosterTemplateRunRecord(ctx, acceptedRun, { audit: false });
	} catch (error) {
		await rollbackAcceptedDutyRosterTemplateRun(ctx, acceptedRun.id);
		throw error;
	}

	await logAcceptedDutyRosterTemplateRun(ctx, acceptedRun.id);
	await logAppliedDutyRosterTemplateRun(ctx, result.acceptedRun.id, {
		inserted: result.insertedCount,
		cleared: result.clearedCount
	});
	return result;
}

async function applyAcceptedDutyRosterTemplateRunRecord(
	ctx: WritePorts,
	run: DutyRosterTemplateAcceptedRun,
	options: { audit?: boolean } = {}
): Promise<DutyRosterTemplateApplyResult> {
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
		await logAppliedDutyRosterTemplateRun(ctx, run.id, {
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

async function logAppliedDutyRosterTemplateRun(
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

async function rollbackAcceptedDutyRosterTemplateRun(ctx: WritePorts, runId: string): Promise<void> {
	await ctx.store.deleteWhere('daily_assignments', ctx.auth.orgId, { duty_roster_template_run_id: runId });
	await ctx.store.delete(DUTY_ROSTER_TEMPLATE_RUN_TABLE, ctx.auth.orgId, runId);
}

async function hydrateAcceptedRunCalendarState(
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
			calendarAssignmentsEdited: linkedCalendarAssignmentsWereEdited(run, runRows)
		};
	});
}
