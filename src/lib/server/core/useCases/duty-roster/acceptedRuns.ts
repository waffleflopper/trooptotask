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
import {
	acceptedRunSnapshot,
	toAcceptedDutyRosterTemplateRun,
	type DutyRosterTemplateRunRow
} from './acceptedRunRecord';
import {
	applyAcceptedDutyRosterRunCalendarSync,
	applyAcceptedDutyRosterRunCalendarSyncWithCompensation,
	applyReviewedAcceptedDutyRosterRunCalendarSyncPlan,
	cleanupAcceptedDutyRosterRunCalendarAssignmentsForInvalidation,
	hydrateAcceptedDutyRosterRunCalendarSyncState,
	loadAcceptedDutyRosterRunLinkedCalendarAssignmentsByRunId,
	loadAcceptedDutyRosterRunCalendarSyncState,
	logAcceptedDutyRosterRunAppliedToCalendar,
	logAcceptedDutyRosterRunInvalidated,
	rollbackAcceptedDutyRosterRunCalendarSync,
	type AcceptedDutyRosterRunCalendarSyncApplyResult
} from './acceptedRunCalendarSync';
import type { DailyAssignmentSlotRecord } from '../daily-assignment-slots';
import {
	hydrateAcceptedRunCorrections,
	loadDutyRosterRunCorrectionsByRunId,
	recordDutyRosterTemplateRunCorrection as recordDutyRosterCorrectionLifecycle
} from './dutyRosterCorrection';

const DUTY_ROSTER_TEMPLATE_RUN_TABLE = 'duty_roster_template_runs';
export const DUTY_ROSTER_HISTORY_PAGE_SIZE = 20;
export const DUTY_ROSTER_HISTORY_MAX_PAGE_SIZE = 50;

export type DutyRosterTemplateApplyResult = AcceptedDutyRosterRunCalendarSyncApplyResult;

export type DutyRosterTemplateInvalidateResult = {
	invalidatedRun: DutyRosterTemplateAcceptedRun;
	invalidatedRuns: DutyRosterTemplateAcceptedRun[];
	removedCalendarAssignments: number;
	calendarAssignmentsEdited: boolean;
};

type AcceptedRunAfterAcceptStep = {
	commit(acceptedRun: DutyRosterTemplateAcceptedRun): Promise<void>;
	compensate(acceptedRun: DutyRosterTemplateAcceptedRun): Promise<void>;
};

export type AcceptedDutyRosterRunCountSource = DutyRosterTemplateCountReadModel & {
	continuationHistory: DutyRosterCountSourceModel['continuationHistory'];
	futureRunConflict: DutyRosterCountSourceModel['futureRunConflict'];
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
	const runs = await hydrateAcceptedDutyRosterRunCalendarSyncState(ctx, runsWithCorrections);
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
		previewStartDate?: string;
		previewEndDate?: string;
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
		baselineStartDate: input.baselineStartDate,
		previewStartDate: input.previewStartDate,
		previewEndDate: input.previewEndDate
	});
}

export async function acceptReviewedDutyRosterTemplatePreview(
	ctx: WritePorts,
	input: {
		preview: DutyRosterTemplatePreview;
		acceptedAt?: string;
		afterAccept?: AcceptedRunAfterAcceptStep;
	}
): Promise<DutyRosterTemplateAcceptedRun> {
	const acceptedRun = await insertAcceptedDutyRosterTemplatePreview(ctx, input);

	try {
		await input.afterAccept?.commit(acceptedRun);
	} catch (error) {
		const afterAccept = input.afterAccept;
		await rollbackAcceptedDutyRosterTemplateRunAfterAcceptedStepFailure(ctx, {
			runId: acceptedRun.id,
			primaryError: error,
			afterAcceptCompensator: afterAccept ? () => afterAccept.compensate(acceptedRun) : undefined
		});
	}

	await tryLogAcceptedDutyRosterTemplateRun(ctx, acceptedRun.id);

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
	input: { runId: string; calendarSyncPlanToken?: string | null }
): Promise<DutyRosterTemplateApplyResult> {
	const row = await ctx.store.findOne<DutyRosterTemplateRunRow>(DUTY_ROSTER_TEMPLATE_RUN_TABLE, ctx.auth.orgId, {
		id: input.runId,
		status: 'accepted'
	});
	if (!row) {
		fail(404, 'Accepted Duty Roster Run not found');
	}

	const [hydrated] = await hydrateAcceptedRunCorrections(ctx, [toAcceptedDutyRosterTemplateRun(row)]);
	const run = hydrated ?? toAcceptedDutyRosterTemplateRun(row);
	if (run.appliedAt) {
		const state = await loadAcceptedDutyRosterRunCalendarSyncState(ctx, run);
		if (state.status === 'in-sync') {
			fail(400, 'Calendar is already in sync with this Accepted Duty Roster Run.');
		}
		if (!input.calendarSyncPlanToken || input.calendarSyncPlanToken !== state.plan.token) {
			fail(409, 'Calendar sync plan changed. Review the current plan before reapplying.');
		}
		return applyReviewedAcceptedDutyRosterRunCalendarSyncPlan(ctx, run, state.plan);
	}

	return applyAcceptedDutyRosterRunCalendarSync(ctx, run);
}

export async function recordDutyRosterTemplateRunCorrection(
	ctx: WritePorts,
	input: DutyRosterTemplateCorrectionInput
): Promise<DutyRosterTemplateRunCorrection> {
	return recordDutyRosterCorrectionLifecycle(ctx, input);
}

export async function invalidateLatestDutyRosterTemplateRun(
	ctx: WritePorts,
	input: { runId: string; cascade?: boolean; excludeRunIds?: string[] }
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
	const excludeRunIds = new Set(input.excludeRunIds ?? []);
	const targetRows = input.cascade
		? templateRuns.filter(
				(candidate) =>
					candidate.id === row.id ||
					(!excludeRunIds.has(candidate.id) && isFollowOnDutyRosterRun(candidate, selectedRun))
			)
		: [selectedRun];
	assertDutyRosterRunsCanBeInvalidated(targetRows, dutyRosterTodayDate());

	const linkedRowsByRunId = await loadAcceptedDutyRosterRunLinkedCalendarAssignmentsByRunId(ctx, targetRows);
	const targetRuns = await hydrateAcceptedRunCorrections(ctx, targetRows.map(toAcceptedDutyRosterTemplateRun));
	const targetRunsById = new Map(targetRuns.map((target) => [target.id, target]));

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
	let calendarCleanup: Awaited<ReturnType<typeof cleanupAcceptedDutyRosterRunCalendarAssignmentsForInvalidation>>;
	try {
		calendarCleanup = await cleanupAcceptedDutyRosterRunCalendarAssignmentsForInvalidation(
			ctx,
			targetRows.map((target) => ({
				run: targetRunsById.get(target.id) ?? toAcceptedDutyRosterTemplateRun(target),
				linkedRows: linkedRowsByRunId.get(target.id) ?? []
			}))
		);
	} catch (error) {
		const rollbackErrors: unknown[] = [];
		for (const updated of updatedRows) {
			try {
				await ctx.store.update<DutyRosterTemplateRunRow>(DUTY_ROSTER_TEMPLATE_RUN_TABLE, ctx.auth.orgId, updated.id, {
					status: 'accepted',
					invalidated_at: null,
					invalidated_by_user_id: null
				});
			} catch (rollbackError) {
				rollbackErrors.push(rollbackError);
			}
		}
		if (rollbackErrors.length > 0) {
			throw invalidationRollbackFailureError(error, rollbackErrors);
		}
		throw error;
	}

	for (const updated of updatedRows) {
		await tryLogAcceptedDutyRosterRunInvalidated(ctx, updated.id, {
			removedCalendarAssignments: calendarCleanup.removedCalendarAssignmentCountByRunId.get(updated.id) ?? 0,
			calendarAssignmentsEdited: calendarCleanup.calendarAssignmentsEditedByRunId.get(updated.id) ?? false
		});
	}

	const invalidatedRuns = updatedRows.map(toAcceptedDutyRosterTemplateRun);
	return {
		invalidatedRun: invalidatedRuns.find((run) => run.id === row.id) ?? invalidatedRuns[0]!,
		invalidatedRuns,
		removedCalendarAssignments: calendarCleanup.removedCalendarAssignments,
		calendarAssignmentsEdited: calendarCleanup.calendarAssignmentsEdited
	};
}

function invalidationRollbackFailureError(primaryError: unknown, rollbackErrors: unknown[]): Error {
	const error = new Error(
		`cleanupAcceptedDutyRosterRunCalendarAssignmentsForInvalidation failed; failed to revert ${rollbackErrors.length} updatedRows using ctx.store.update on ${DUTY_ROSTER_TEMPLATE_RUN_TABLE}. Primary failure: ${errorMessage(primaryError)}. Rollback failures: ${rollbackErrors.map(errorMessage).join('; ')}.`
	);
	return Object.assign(error, { primaryError, rollbackErrors });
}

function errorMessage(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.replace(/[.]+$/, '');
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
	input: {
		preview: DutyRosterTemplatePreview;
		afterAccept?: AcceptedRunAfterAcceptStep;
	}
): Promise<DutyRosterTemplateApplyResult> {
	const acceptedRun = await insertAcceptedDutyRosterTemplatePreview(ctx, input);
	let compensated: Awaited<ReturnType<typeof applyAcceptedDutyRosterRunCalendarSyncWithCompensation>>;
	try {
		compensated = await applyAcceptedDutyRosterRunCalendarSyncWithCompensation(ctx, acceptedRun, { audit: false });
	} catch (error) {
		await tryRollbackAcceptedDutyRosterTemplateRun(ctx, acceptedRun.id);
		throw error;
	}

	try {
		await input.afterAccept?.commit(acceptedRun);
	} catch (error) {
		const afterAccept = input.afterAccept;
		await rollbackAcceptedDutyRosterTemplateRunAfterAcceptedStepFailure(ctx, {
			runId: acceptedRun.id,
			primaryError: error,
			calendarRollbackRecords: compensated.rollbackRecords,
			afterAcceptCompensator: afterAccept ? () => afterAccept.compensate(acceptedRun) : undefined
		});
	}

	const { result } = compensated;
	await tryLogAcceptedDutyRosterTemplateRun(ctx, acceptedRun.id);
	await tryLogAcceptedDutyRosterRunAppliedToCalendar(ctx, result.acceptedRun.id, {
		inserted: result.insertedCount,
		cleared: result.clearedCount
	});
	return result;
}

async function tryLogAcceptedDutyRosterRunInvalidated(
	ctx: WritePorts,
	runId: string,
	details: { removedCalendarAssignments: number; calendarAssignmentsEdited: boolean }
): Promise<void> {
	try {
		await logAcceptedDutyRosterRunInvalidated(ctx, runId, details);
	} catch {
		// Invalidation is already durable; audit failure should not make callers retry against mutated state.
	}
}

async function tryLogAcceptedDutyRosterTemplateRun(ctx: WritePorts, runId: string): Promise<void> {
	try {
		await logAcceptedDutyRosterTemplateRun(ctx, runId);
	} catch (error) {
		console.error('[duty-roster] Failed to log accepted Duty Roster Run audit event:', {
			orgId: ctx.auth.orgId,
			userId: ctx.auth.userId,
			runId,
			error
		});
		// Accepted-run and Calendar writes are already durable; audit failure should not make callers retry.
	}
}

async function tryLogAcceptedDutyRosterRunAppliedToCalendar(
	ctx: WritePorts,
	runId: string,
	details: { inserted: number; cleared: number }
): Promise<void> {
	try {
		await logAcceptedDutyRosterRunAppliedToCalendar(ctx, runId, details);
	} catch {
		// Calendar writes and the accepted-run applied marker are already durable.
	}
}

async function rollbackAcceptedDutyRosterTemplateRun(ctx: WritePorts, runId: string): Promise<void> {
	await ctx.store.delete(DUTY_ROSTER_TEMPLATE_RUN_TABLE, ctx.auth.orgId, runId);
}

async function rollbackAcceptedDutyRosterTemplateRunAfterAcceptedStepFailure(
	ctx: WritePorts,
	input: {
		runId: string;
		primaryError: unknown;
		calendarRollbackRecords?: DailyAssignmentSlotRecord[];
		afterAcceptCompensator?: () => Promise<void>;
	}
): Promise<never> {
	const rollbackErrors: unknown[] = [];
	if (input.afterAcceptCompensator) {
		try {
			await input.afterAcceptCompensator();
		} catch (rollbackError) {
			rollbackErrors.push(rollbackError);
		}
	}

	if (input.calendarRollbackRecords) {
		try {
			await rollbackAcceptedDutyRosterRunCalendarSync(ctx, input.runId, input.calendarRollbackRecords);
		} catch (rollbackError) {
			rollbackErrors.push(rollbackError);
		}
	}

	try {
		await rollbackAcceptedDutyRosterTemplateRun(ctx, input.runId);
	} catch (rollbackError) {
		rollbackErrors.push(rollbackError);
	}

	if (rollbackErrors.length > 0) {
		throw acceptedRunRollbackFailureError(input.primaryError, rollbackErrors);
	}
	throw input.primaryError;
}

async function tryRollbackAcceptedDutyRosterTemplateRun(ctx: WritePorts, runId: string): Promise<void> {
	try {
		await rollbackAcceptedDutyRosterTemplateRun(ctx, runId);
	} catch {
		// Preserve the original apply error; callers still need the primary failure.
	}
}

function acceptedRunRollbackFailureError(primaryError: unknown, rollbackErrors: unknown[]): Error {
	const error = new Error(
		`Failed to roll back accepted Duty Roster Run after accepted step failure; rollback failures: ${rollbackErrors.map(errorMessage).join('; ')}. Primary failure: ${errorMessage(primaryError)}.`
	);
	return Object.assign(error, { primaryError, rollbackErrors });
}
