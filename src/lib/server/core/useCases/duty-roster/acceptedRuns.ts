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
	dutyRosterAcceptedSnapshotPersonnelIds,
	type DutyRosterCountSourceModel,
	type DutyRosterCountSourceRun
} from '$features/duty-roster/templates/dutyRosterCountSource';
import { dutyRosterTodayDate } from '$features/duty-roster/templates/dutyRosterDatePolicy';
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
export const DUTY_ROSTER_HISTORY_PAGE_SIZE = 20;
export const DUTY_ROSTER_HISTORY_MAX_PAGE_SIZE = 50;

export type DutyRosterTemplateApplyResult = {
	acceptedRun: DutyRosterTemplateAcceptedRun;
	insertedCount: number;
	clearedCount: number;
};

export type DutyRosterTemplateInvalidateResult = {
	invalidatedRun: DutyRosterTemplateAcceptedRun;
	invalidatedRuns: DutyRosterTemplateAcceptedRun[];
	removedCalendarAssignments: number;
	calendarAssignmentsEdited: boolean;
};

export type AcceptedDutyRosterRunCountSource = DutyRosterTemplateCountReadModel & {
	continuationHistory: DutyRosterCountSourceModel['continuationHistory'];
};

export type ListAcceptedDutyRosterTemplateRunsOptions = {
	page?: number;
	pageSize?: number;
	includeRunId?: string | null;
};

export type DutyRosterTemplateRunHistoryPage = {
	runs: DutyRosterTemplateAcceptedRun[];
	page: number;
	pageSize: number;
	hasMore: boolean;
	nextPage: number | null;
	previousPage: number | null;
	latestRunId: string | null;
};

export async function listAcceptedDutyRosterTemplateRuns(
	ctx: QueryPorts,
	templateId: string,
	options: ListAcceptedDutyRosterTemplateRunsOptions = {}
): Promise<DutyRosterTemplateAcceptedRun[]> {
	const page = await listAcceptedDutyRosterTemplateRunHistory(ctx, templateId, options);
	return page.runs;
}

export async function listAcceptedDutyRosterTemplateRunHistory(
	ctx: QueryPorts,
	templateId: string,
	options: ListAcceptedDutyRosterTemplateRunsOptions = {}
): Promise<DutyRosterTemplateRunHistoryPage> {
	const page = normalizeHistoryPage(options.page);
	const pageSize = normalizeHistoryPageSize(options.pageSize);
	const from = (page - 1) * pageSize;
	const to = from + pageSize;
	const rows = await ctx.store.findMany<DutyRosterTemplateRunRow>(
		DUTY_ROSTER_TEMPLATE_RUN_TABLE,
		ctx.auth.orgId,
		{ template_id: templateId },
		{
			inFilters: { status: ['accepted', 'invalidated'] },
			orderBy: [{ column: 'accepted_at', ascending: false }],
			range: { from, to }
		}
	);
	const latestRunId = await loadLatestAcceptedDutyRosterTemplateRunId(ctx, templateId);
	const pageRows = rows.slice(0, pageSize);
	const includeRunId = options.includeRunId?.trim();
	const includesRequestedRun = Boolean(includeRunId && pageRows.some((row) => row.id === includeRunId));
	if (includeRunId && !includesRequestedRun) {
		const includedRow = await ctx.store.findOne<DutyRosterTemplateRunRow>(
			DUTY_ROSTER_TEMPLATE_RUN_TABLE,
			ctx.auth.orgId,
			{
				id: includeRunId,
				template_id: templateId
			}
		);
		if (includedRow && (includedRow.status === 'accepted' || includedRow.status === 'invalidated')) {
			pageRows.push(includedRow);
		}
	}

	const runsWithCorrections = await hydrateAcceptedRunActorDisplayNames(
		ctx,
		await hydrateAcceptedRunCorrections(ctx, pageRows.map(toAcceptedDutyRosterTemplateRun))
	);
	const runs = await hydrateAcceptedRunCalendarState(ctx, runsWithCorrections);
	return {
		runs,
		page,
		pageSize,
		hasMore: rows.length > pageSize,
		nextPage: rows.length > pageSize ? page + 1 : null,
		previousPage: page > 1 ? page - 1 : null,
		latestRunId
	};
}

function normalizeHistoryPage(value: number | undefined): number {
	if (!Number.isFinite(value)) return 1;
	return Math.max(1, Math.trunc(value ?? 1));
}

function normalizeHistoryPageSize(value: number | undefined): number {
	if (!Number.isFinite(value)) return DUTY_ROSTER_HISTORY_PAGE_SIZE;
	return Math.min(DUTY_ROSTER_HISTORY_MAX_PAGE_SIZE, Math.max(1, Math.trunc(value ?? DUTY_ROSTER_HISTORY_PAGE_SIZE)));
}

async function loadLatestAcceptedDutyRosterTemplateRunId(ctx: QueryPorts, templateId: string): Promise<string | null> {
	const rows = await ctx.store.findMany<{ id: string }>(
		DUTY_ROSTER_TEMPLATE_RUN_TABLE,
		ctx.auth.orgId,
		{ template_id: templateId },
		{
			select: 'id',
			inFilters: { status: ['accepted', 'invalidated'] },
			orderBy: [{ column: 'accepted_at', ascending: false }],
			limit: 1
		}
	);

	return rows[0]?.id ?? null;
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

export async function loadAcceptedDutyRosterTemplateRunPersonnelIds(
	ctx: QueryPorts,
	templateId: string
): Promise<Set<string>> {
	const rows = await ctx.store.findMany<DutyRosterTemplateRunRow>(
		DUTY_ROSTER_TEMPLATE_RUN_TABLE,
		ctx.auth.orgId,
		{ template_id: templateId, status: 'accepted' },
		{ select: 'snapshot_payload' }
	);

	return new Set(rows.flatMap((row) => dutyRosterAcceptedSnapshotPersonnelIds(acceptedRunSnapshot(row))));
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
	input: { runId: string; cascade?: boolean }
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
			inFilters: { status: ['accepted'] },
			orderBy: [
				{ column: 'start_date', ascending: true },
				{ column: 'accepted_at', ascending: true }
			]
		}
	);
	const selectedRun = templateRuns.find((candidate) => candidate.id === row.id) ?? row;
	const targetRows = input.cascade
		? templateRuns.filter((candidate) => candidate.id === row.id || isFollowOnDutyRosterRun(candidate, selectedRun))
		: [selectedRun];
	assertDutyRosterRunsCanBeInvalidated(targetRows, dutyRosterTodayDate());

	const linkedRowsByRunId = await loadLinkedCalendarAssignmentRowsByRunId(ctx, targetRows);
	const calendarAssignmentsEditedByRunId = new Map(
		targetRows.map((target) => [
			target.id,
			linkedCalendarAssignmentsWereEdited(
				toAcceptedDutyRosterTemplateRun(target),
				linkedRowsByRunId.get(target.id) ?? []
			)
		])
	);
	const linkedRows = [...linkedRowsByRunId.values()].flat();

	const invalidatedAt = new Date().toISOString();
	await assertDutyRosterRunsAreInvalidatableAtWriteTime(ctx, {
		templateId: row.template_id,
		targetRunIds: targetRows.map((target) => target.id),
		todayDate: dutyRosterTodayDate()
	});
	const updatedRows: DutyRosterTemplateRunRow[] = [];
	for (const target of targetRows) {
		updatedRows.push(
			await ctx.store.update<DutyRosterTemplateRunRow>(DUTY_ROSTER_TEMPLATE_RUN_TABLE, ctx.auth.orgId, target.id, {
				status: 'invalidated',
				invalidated_at: invalidatedAt,
				invalidated_by_user_id: ctx.auth.userId
			})
		);
	}
	let calendarRemoval: { cleared: number };
	try {
		calendarRemoval =
			linkedRows.length > 0
				? await batchDailyAssignments(ctx, {
						records: linkedRows.map((assignment) => ({
							date: assignment.date,
							assignmentTypeId: assignment.assignment_type_id,
							assigneeId: ''
						}))
					})
				: { inserted: [], cleared: 0 };
	} catch (error) {
		for (const updated of updatedRows) {
			await ctx.store.update<DutyRosterTemplateRunRow>(DUTY_ROSTER_TEMPLATE_RUN_TABLE, ctx.auth.orgId, updated.id, {
				status: 'accepted',
				invalidated_at: null,
				invalidated_by_user_id: null
			});
		}
		throw error;
	}

	for (const updated of updatedRows) {
		await ctx.audit.log({
			action: 'duty_roster_template_run.invalidated',
			resourceType: 'duty_roster_template_run',
			resourceId: updated.id,
			details: {
				removedCalendarAssignments: (linkedRowsByRunId.get(updated.id) ?? []).length,
				calendarAssignmentsEdited: calendarAssignmentsEditedByRunId.get(updated.id) ?? false
			}
		});
	}

	const invalidatedRuns = updatedRows.map(toAcceptedDutyRosterTemplateRun);
	return {
		invalidatedRun: invalidatedRuns.find((run) => run.id === row.id) ?? invalidatedRuns[0]!,
		invalidatedRuns,
		removedCalendarAssignments: calendarRemoval.cleared,
		calendarAssignmentsEdited: [...calendarAssignmentsEditedByRunId.values()].some(Boolean)
	};
}

function isFollowOnDutyRosterRun(candidate: DutyRosterTemplateRunRow, selected: DutyRosterTemplateRunRow): boolean {
	if (candidate.start_date !== selected.start_date) {
		return candidate.start_date > selected.start_date;
	}
	if (candidate.end_date !== selected.end_date) {
		return candidate.end_date > selected.end_date;
	}
	return candidate.accepted_at > selected.accepted_at;
}

function assertDutyRosterRunsCanBeInvalidated(rows: DutyRosterTemplateRunRow[], todayDate: string): void {
	for (const row of rows) {
		if (row.status === 'invalidated') {
			fail(400, 'Duty Roster Run is already invalidated.');
		}
		if (row.end_date < todayDate) {
			fail(400, 'Duty Roster Run has ended and can no longer be invalidated.');
		}
	}
}

async function loadLinkedCalendarAssignmentRowsByRunId(
	ctx: WritePorts,
	rows: DutyRosterTemplateRunRow[]
): Promise<Map<string, DutyRosterTemplateLinkedCalendarAssignmentRow[]>> {
	const linkedRowsByRunId = new Map<string, DutyRosterTemplateLinkedCalendarAssignmentRow[]>();
	for (const row of rows) {
		linkedRowsByRunId.set(
			row.id,
			row.applied_at
				? await ctx.store.findMany<DutyRosterTemplateLinkedCalendarAssignmentRow>(
						'daily_assignments',
						ctx.auth.orgId,
						{ duty_roster_template_run_id: row.id },
						{
							select:
								'id, duty_roster_template_run_id, duty_roster_template_run_row_date, date, assignment_type_id, assignee_id'
						}
					)
				: []
		);
	}

	return linkedRowsByRunId;
}

async function assertDutyRosterRunsAreInvalidatableAtWriteTime(
	ctx: WritePorts,
	input: { templateId: string; targetRunIds: string[]; todayDate: string }
): Promise<void> {
	const targetRunIds = new Set(input.targetRunIds);
	const rows = await ctx.store.findMany<DutyRosterTemplateRunRow>(
		DUTY_ROSTER_TEMPLATE_RUN_TABLE,
		ctx.auth.orgId,
		{ template_id: input.templateId },
		{
			inFilters: { status: ['accepted'] }
		}
	);
	const selectedRows = rows.filter((candidate) => targetRunIds.has(candidate.id));
	if (selectedRows.length !== targetRunIds.size) {
		fail(409, 'Duty Roster Run changed before invalidation. Refresh history and try again.');
	}
	assertDutyRosterRunsCanBeInvalidated(selectedRows, input.todayDate);
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
