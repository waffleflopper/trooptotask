import { z } from 'zod';
import { fail } from '$lib/server/core/errors';
import type { QueryPorts, WritePorts } from '$lib/server/core/ports';
import type { Personnel } from '$lib/types';
import type {
	DutyRosterPoolPersonnel,
	DutyRosterCorrectionPoolOverrideReason,
	DutyRosterTemplate,
	DutyRosterTemplateAcceptPreviewInput,
	DutyRosterTemplateAcceptedRun,
	DutyRosterTemplateCorrectionInput,
	DutyRosterTemplateCountReadModel,
	DutyRosterTemplateGenerateInput,
	DutyRosterTemplateManualSelectionInput,
	DutyRosterTemplateRunCorrection
} from '$features/duty-roster/templates/dutyRosterTemplates';
import {
	dutyRosterCorrectionCountsTowardFuture,
	effectiveDutyRosterAssigneeId
} from '$features/duty-roster/templates/dutyRosterCorrection';
import { dutyRosterAcceptedSnapshotPersonnelIds } from '$features/duty-roster/templates/dutyRosterCountSource';
import { dutyRosterTodayDate } from '$features/duty-roster/templates/dutyRosterDatePolicy';
import {
	applyDutyRosterTemplateManualSelection,
	assertDutyRosterTemplatePreview,
	buildDutyRosterTemplateAcceptedSnapshot,
	type DutyRosterTemplatePreview
} from '$features/duty-roster/templates/dutyRosterTemplatePreview';
import { loadRosterPersonnel } from '../rosterReadModel';
import type { DailyAssignmentSlotRecord } from '../daily-assignment-slots';
import {
	acceptedRunSnapshot,
	parseAcceptedRunSnapshot,
	toAcceptedDutyRosterTemplateRun,
	loadDutyRosterRunCorrectionsByRunId,
	DUTY_ROSTER_TEMPLATE_CORRECTION_TABLE,
	type DutyRosterTemplateRunCorrectionRow,
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
	syncAcceptedDutyRosterCorrectionToCalendar,
	type AcceptedDutyRosterRunCalendarSyncApplyResult
} from './acceptedRunCalendarSync';
import {
	assertReviewedDutyRosterTemplatePreviewIsCurrent,
	buildDutyRosterTemplatePreviewFromCurrentState,
	loadDutyRosterTemplateCountReadModelSource,
	toDutyRosterTemplateCountReadModel
} from './templatePreviewAssembly';
import { DUTY_ROSTER_TEMPLATE_TABLE, toDutyRosterTemplate, type DutyRosterTemplateRow } from './templateRecord';

const DUTY_ROSTER_TEMPLATE_RUN_TABLE = 'duty_roster_template_runs';
export const DUTY_ROSTER_HISTORY_PAGE_SIZE = 20;
export const DUTY_ROSTER_HISTORY_MAX_PAGE_SIZE = 50;

const MAX_PREVIEW_DAYS = 62;
const MAX_SUBMITTED_PREVIEW_PAYLOAD_LENGTH = 2 * 1024 * 1024;
const PREVIEW_PAYLOAD_TOO_LARGE_MESSAGE = 'Duty Roster preview payload is too large. Generate the preview again.';
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DUTY_ROSTER_GENERATION_PATTERNS = ['daily', 'weekday-only', 'weekend-only', 'selected-weekdays'] as const;

export type DutyRosterTemplateApplyResult = AcceptedDutyRosterRunCalendarSyncApplyResult;

export type DutyRosterTemplateInvalidateResult = {
	invalidatedRun: DutyRosterTemplateAcceptedRun;
	invalidatedRuns: DutyRosterTemplateAcceptedRun[];
	removedCalendarAssignments: number;
	calendarAssignmentsEdited: boolean;
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

const generatePreviewSchema = z
	.object({
		templateId: z.string().trim().min(1, 'Duty Roster Template is required'),
		startDate: z.string().refine(isValidDateOnly, 'Start date is required'),
		endDate: z.string().refine(isValidDateOnly, 'End date is required'),
		pattern: z.enum(DUTY_ROSTER_GENERATION_PATTERNS).default('daily'),
		selectedWeekdays: z.array(z.number().int().min(0).max(6)).default([]),
		skipHolidaysAndDonsas: z.boolean().default(false)
	})
	.transform((input) => ({
		...input,
		selectedWeekdays: [...new Set(input.selectedWeekdays)].sort((left, right) => left - right)
	}))
	.refine((input) => input.endDate >= input.startDate, {
		message: 'End date must be on or after the start date',
		path: ['endDate']
	})
	.refine((input) => inclusiveDateSpan(input.startDate, input.endDate) <= MAX_PREVIEW_DAYS, {
		message: `Generate preview can cover ${MAX_PREVIEW_DAYS} days or fewer`,
		path: ['endDate']
	})
	.refine((input) => input.startDate >= dutyRosterTodayDate(), {
		message: 'Duty Roster previews cannot start in the past',
		path: ['startDate']
	})
	.refine((input) => input.pattern !== 'selected-weekdays' || input.selectedWeekdays.length > 0, {
		message: 'Select at least one weekday.',
		path: ['selectedWeekdays']
	});
const manualSelectionSchema = z.object({
	preview: z
		.string()
		.trim()
		.min(1, 'Generate the preview again before changing assignments.')
		.max(MAX_SUBMITTED_PREVIEW_PAYLOAD_LENGTH, PREVIEW_PAYLOAD_TOO_LARGE_MESSAGE),
	date: z.string().refine(isValidDateOnly, 'Duty date is required'),
	assigneeId: z.string().trim().min(1, 'Selected Soldier is required'),
	reason: z.string().trim().nullable().optional()
});
const acceptPreviewSchema = z.object({
	preview: z
		.string()
		.trim()
		.min(1, 'Generate the preview again before accepting.')
		.max(MAX_SUBMITTED_PREVIEW_PAYLOAD_LENGTH, PREVIEW_PAYLOAD_TOO_LARGE_MESSAGE),
	futureRunConflictResolution: z.enum(['acknowledge', 'invalidate-following']).nullable().optional()
});
const correctionSchema = z.object({
	runId: z.string().trim().min(1, 'Accepted Duty Roster Run is required'),
	runRowDate: z.string().refine(isValidDateOnly, 'Duty date is required'),
	replacementAssigneeId: z.string().trim().min(1, 'Replacement Soldier is required'),
	reason: z.string().trim().min(1, 'Correction reason is required')
});

function isValidDateOnly(value: string): boolean {
	if (!DATE_ONLY_PATTERN.test(value)) {
		return false;
	}

	const date = dateOnlyUtc(value);
	if (Number.isNaN(date.getTime())) {
		return false;
	}

	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	return `${year}-${month}-${day}` === value;
}

function inclusiveDateSpan(startDate: string, endDate: string): number {
	const start = dateOnlyUtc(startDate).getTime();
	const end = dateOnlyUtc(endDate).getTime();
	return Math.floor((end - start) / 86_400_000) + 1;
}

function dateOnlyUtc(value: string): Date {
	const [year, month, day] = value.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day));
}

function parseGenerateInput(input: DutyRosterTemplateGenerateInput): DutyRosterTemplateGenerateInput {
	const parsed = generatePreviewSchema.safeParse(input);
	if (!parsed.success) {
		fail(400, parsed.error.issues[0]?.message ?? 'Duty Roster preview input is invalid');
	}

	return parsed.data;
}

function parseManualSelectionInput(
	input: DutyRosterTemplateManualSelectionInput
): DutyRosterTemplateManualSelectionInput {
	const parsed = manualSelectionSchema.safeParse(input);
	if (!parsed.success) {
		fail(400, parsed.error.issues[0]?.message ?? 'Manual selection input is invalid');
	}

	return parsed.data;
}

function parseAcceptPreviewInput(input: DutyRosterTemplateAcceptPreviewInput): DutyRosterTemplateAcceptPreviewInput {
	const parsed = acceptPreviewSchema.safeParse(input);
	if (!parsed.success) {
		fail(400, parsed.error.issues[0]?.message ?? 'Accept preview input is invalid');
	}

	return parsed.data;
}

function parseCorrectionInput(input: DutyRosterTemplateCorrectionInput): DutyRosterTemplateCorrectionInput {
	const parsed = correctionSchema.safeParse(input);
	if (!parsed.success) {
		fail(400, parsed.error.issues[0]?.message ?? 'Duty Roster Correction input is invalid');
	}

	return parsed.data;
}

function parseSubmittedDutyRosterPreview(previewPayload: string): DutyRosterTemplatePreview {
	const preview: unknown = JSON.parse(previewPayload);
	assertDutyRosterTemplatePreview(preview);
	return preview;
}

export async function generateDutyRosterTemplatePreview(
	ctx: WritePorts,
	input: DutyRosterTemplateGenerateInput
): Promise<DutyRosterTemplatePreview> {
	const parsed = parseGenerateInput(input);
	const existing = await ctx.store.findOne<DutyRosterTemplateRow>(DUTY_ROSTER_TEMPLATE_TABLE, ctx.auth.orgId, {
		id: parsed.templateId,
		status: 'active'
	});
	if (!existing) {
		fail(404, 'Duty Roster Template not found');
	}

	const template = toDutyRosterTemplate(existing);
	return buildDutyRosterTemplatePreviewFromCurrentState(ctx, {
		template,
		startDate: parsed.startDate,
		endDate: parsed.endDate,
		pattern: parsed.pattern,
		selectedWeekdays: parsed.selectedWeekdays,
		skipHolidaysAndDonsas: parsed.skipHolidaysAndDonsas,
		generatedAt: new Date().toISOString()
	});
}

export async function applyDutyRosterTemplatePreviewManualSelection(
	ctx: WritePorts,
	input: DutyRosterTemplateManualSelectionInput
): Promise<DutyRosterTemplatePreview> {
	const parsed = parseManualSelectionInput(input);
	try {
		const preview = parseSubmittedDutyRosterPreview(parsed.preview);
		return applyDutyRosterTemplateManualSelection(preview, {
			date: parsed.date,
			assigneeId: parsed.assigneeId,
			reason: parsed.reason
		});
	} catch (errorValue) {
		fail(400, errorValue instanceof Error ? errorValue.message : 'Manual selection input is invalid');
	}
}

export async function loadDutyRosterTemplateCountReadModel(
	ctx: QueryPorts,
	template: DutyRosterTemplate
): Promise<DutyRosterTemplateCountReadModel> {
	const readModel = await loadDutyRosterTemplateCountReadModelSource(ctx, template);
	return toDutyRosterTemplateCountReadModel(readModel);
}

export async function acceptDutyRosterTemplatePreview(
	ctx: WritePorts,
	input: DutyRosterTemplateAcceptPreviewInput
): Promise<DutyRosterTemplateAcceptedRun> {
	const preview = await buildReviewedDutyRosterTemplatePreview(ctx, input);
	const resolution = parseAcceptPreviewInput(input).futureRunConflictResolution ?? null;
	assertFutureRunConflictResolution(preview, resolution);

	const acceptedRun = await insertAcceptedDutyRosterTemplatePreview(ctx, { preview });
	try {
		await applyFutureRunConflictResolution(ctx, preview, resolution, { excludeRunIds: [acceptedRun.id] });
	} catch (error) {
		await rollbackAcceptedDutyRosterTemplateRunAfterAcceptedStepFailure(ctx, {
			runId: acceptedRun.id,
			primaryError: error
		});
	}

	await tryLogAcceptedDutyRosterTemplateRun(ctx, acceptedRun.id);

	return acceptedRun;
}

export async function acceptAndApplyDutyRosterTemplatePreview(
	ctx: WritePorts,
	input: DutyRosterTemplateAcceptPreviewInput
): Promise<DutyRosterTemplateApplyResult> {
	const preview = await buildReviewedDutyRosterTemplatePreview(ctx, input);
	const resolution = parseAcceptPreviewInput(input).futureRunConflictResolution ?? null;
	assertFutureRunConflictResolution(preview, resolution);

	const acceptedRun = await insertAcceptedDutyRosterTemplatePreview(ctx, { preview });
	let compensated: Awaited<ReturnType<typeof applyAcceptedDutyRosterRunCalendarSyncWithCompensation>>;
	try {
		compensated = await applyAcceptedDutyRosterRunCalendarSyncWithCompensation(ctx, acceptedRun, { audit: false });
	} catch (error) {
		await tryRollbackAcceptedDutyRosterTemplateRun(ctx, acceptedRun.id);
		throw error;
	}

	try {
		await applyFutureRunConflictResolution(ctx, preview, resolution, { excludeRunIds: [acceptedRun.id] });
	} catch (error) {
		await rollbackAcceptedDutyRosterTemplateRunAfterAcceptedStepFailure(ctx, {
			runId: acceptedRun.id,
			primaryError: error,
			calendarRollbackRecords: compensated.rollbackRecords
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

async function buildReviewedDutyRosterTemplatePreview(
	ctx: WritePorts,
	input: DutyRosterTemplateAcceptPreviewInput
): Promise<DutyRosterTemplatePreview> {
	const parsed = parseAcceptPreviewInput(input);
	let preview: DutyRosterTemplatePreview;
	try {
		preview = parseSubmittedDutyRosterPreview(parsed.preview);
	} catch (errorValue) {
		fail(400, errorValue instanceof Error ? errorValue.message : 'Accept preview input is invalid');
	}

	const existing = await ctx.store.findOne<DutyRosterTemplateRow>(DUTY_ROSTER_TEMPLATE_TABLE, ctx.auth.orgId, {
		id: preview.assignmentType.id,
		status: 'active'
	});
	if (!existing) {
		fail(404, 'Duty Roster Template not found');
	}

	const previewRange = parseGenerateInput({
		templateId: preview.assignmentType.id,
		startDate: preview.config.startDate,
		endDate: preview.config.endDate
	});
	let acceptedPreview = await buildDutyRosterTemplatePreviewFromCurrentState(ctx, {
		template: toDutyRosterTemplate(existing),
		startDate: previewRange.startDate,
		endDate: previewRange.endDate,
		generatedAt: preview.generatedAt
	});
	assertReviewedDutyRosterTemplatePreviewIsCurrent({
		reviewedPreview: preview,
		currentPreview: acceptedPreview
	});
	try {
		for (const selection of preview.manualSelections) {
			acceptedPreview = applyDutyRosterTemplateManualSelection(acceptedPreview, {
				date: selection.date,
				assigneeId: selection.assigneeId,
				reason: selection.reason
			});
		}
	} catch (errorValue) {
		fail(400, errorValue instanceof Error ? errorValue.message : 'Accept preview input is invalid');
	}

	return acceptedPreview;
}

function assertFutureRunConflictResolution(
	preview: DutyRosterTemplatePreview,
	resolution: DutyRosterTemplateAcceptPreviewInput['futureRunConflictResolution'] | null
): void {
	if (preview.futureRunConflict && !resolution) {
		fail(409, 'Choose how to handle later accepted runs before accepting this Duty Roster preview.');
	}
}

async function applyFutureRunConflictResolution(
	ctx: WritePorts,
	preview: DutyRosterTemplatePreview,
	resolution: DutyRosterTemplateAcceptPreviewInput['futureRunConflictResolution'] | null,
	options: { excludeRunIds?: string[] } = {}
): Promise<DutyRosterTemplateInvalidateResult | null> {
	if (resolution !== 'invalidate-following') {
		return null;
	}

	const firstAffectedRunId = await loadFirstAcceptedRunAffectedByPreview(ctx, preview, options);
	if (!firstAffectedRunId) {
		return null;
	}

	return invalidateAcceptedDutyRosterRuns(ctx, {
		runId: firstAffectedRunId,
		cascade: true,
		excludeRunIds: options.excludeRunIds
	});
}

async function loadFirstAcceptedRunAffectedByPreview(
	ctx: WritePorts,
	preview: DutyRosterTemplatePreview,
	options: { excludeRunIds?: string[] } = {}
): Promise<string | null> {
	const excludeRunIds = new Set(options.excludeRunIds ?? []);
	const rows = await ctx.store.findMany<DutyRosterTemplateRunRow>(
		DUTY_ROSTER_TEMPLATE_RUN_TABLE,
		ctx.auth.orgId,
		{ template_id: preview.assignmentType.id },
		{
			inFilters: { status: ['accepted'] },
			rangeFilters: [{ column: 'end_date', op: 'gte', value: preview.config.startDate }]
		}
	);

	return rows.filter((row) => !excludeRunIds.has(row.id)).sort(compareAcceptedRunRowsByDutyWindow)[0]?.id ?? null;
}

function compareAcceptedRunRowsByDutyWindow(left: DutyRosterTemplateRunRow, right: DutyRosterTemplateRunRow): number {
	const startDiff = left.start_date.localeCompare(right.start_date);
	if (startDiff !== 0) return startDiff;

	const endDiff = left.end_date.localeCompare(right.end_date);
	if (endDiff !== 0) return endDiff;

	const acceptedDiff = left.accepted_at.localeCompare(right.accepted_at);
	if (acceptedDiff !== 0) return acceptedDiff;

	return left.id.localeCompare(right.id);
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

export async function applyAcceptedDutyRosterTemplateRun(
	ctx: WritePorts,
	input: { runId: string; calendarSyncPlanToken?: string | null }
): Promise<DutyRosterTemplateApplyResult> {
	await assertAcceptedRunTemplateIsActive(ctx, input.runId);

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
	const parsed = parseCorrectionInput(input);
	await assertAcceptedRunTemplateIsActive(ctx, parsed.runId);

	const row = await ctx.store.findOne<DutyRosterTemplateRunRow>(DUTY_ROSTER_TEMPLATE_RUN_TABLE, ctx.auth.orgId, {
		id: parsed.runId
	});
	if (!row) {
		fail(404, 'Accepted Duty Roster Run not found');
	}
	if (row.status === 'invalidated') {
		fail(400, 'Invalidated Duty Roster Runs cannot be corrected.');
	}

	const snapshot = acceptedRunSnapshot(row);
	const acceptedRow = snapshot.finalRows.find((candidate) => candidate.date === parsed.runRowDate);
	if (!acceptedRow) {
		fail(400, 'Duty date is not part of this accepted run.');
	}
	if (!acceptedRow.finalAssigneeId) {
		fail(400, 'Only assigned Duty Roster rows can be corrected.');
	}

	const latestCorrections = await ctx.store.findMany<DutyRosterTemplateRunCorrectionRow>(
		DUTY_ROSTER_TEMPLATE_CORRECTION_TABLE,
		ctx.auth.orgId,
		{ run_id: parsed.runId, run_row_date: parsed.runRowDate },
		{ orderBy: [{ column: 'corrected_at', ascending: true }] }
	);
	const currentEffectiveAssigneeId = effectiveDutyRosterAssigneeId({
		runRowDate: parsed.runRowDate,
		acceptedAssigneeId: acceptedRow.finalAssigneeId,
		corrections: latestCorrections.map(toCorrectionEffect)
	});
	if (currentEffectiveAssigneeId === parsed.replacementAssigneeId) {
		fail(400, 'Replacement Soldier must differ from the current Soldier.');
	}

	const [replacement] = await loadRosterPersonnel(ctx, {
		status: 'active',
		filters: { id: parsed.replacementAssigneeId }
	});
	if (!replacement) {
		fail(400, 'Replacement Soldier is missing or archived.');
	}
	const poolOverrideReasons = dutyRosterCorrectionPoolOverrideReasons(snapshot, parsed.replacementAssigneeId);

	const correctedAt = new Date().toISOString();
	const inserted = await ctx.store.insert<DutyRosterTemplateRunCorrectionRow>(
		DUTY_ROSTER_TEMPLATE_CORRECTION_TABLE,
		ctx.auth.orgId,
		{
			run_id: row.id,
			run_row_date: parsed.runRowDate,
			original_assignee_id: currentEffectiveAssigneeId,
			replacement_assignee_id: parsed.replacementAssigneeId,
			reason: parsed.reason,
			corrected_by_user_id: ctx.auth.userId,
			corrected_at: correctedAt,
			created_at: correctedAt
		}
	);

	if (row.applied_at) {
		try {
			await syncAcceptedDutyRosterCorrectionToCalendar(ctx, {
				runRow: row,
				runRowDate: parsed.runRowDate,
				replacementAssigneeId: parsed.replacementAssigneeId
			});
		} catch (error) {
			await ctx.store.delete(DUTY_ROSTER_TEMPLATE_CORRECTION_TABLE, ctx.auth.orgId, inserted.id);
			throw error;
		}
	}

	await ctx.audit.log({
		action: 'duty_roster_template_run.corrected',
		resourceType: 'duty_roster_template_run',
		resourceId: row.id,
		details: {
			correctionId: inserted.id,
			runRowDate: inserted.run_row_date,
			originalAssigneeId: inserted.original_assignee_id,
			replacementAssigneeId: inserted.replacement_assignee_id,
			poolOverride: poolOverrideReasons.length > 0,
			poolOverrideReasons,
			calendarSynced: Boolean(row.applied_at)
		}
	});

	return buildDutyRosterTemplateRunCorrectionReadModel({
		row: inserted,
		runStatus: row.status,
		snapshot,
		personnelById: new Map([[parsed.replacementAssigneeId, toDutyRosterPoolPersonnel(replacement)]])
	});
}

export async function invalidateLatestDutyRosterTemplateRun(
	ctx: WritePorts,
	input: { runId: string; cascade?: boolean; excludeRunIds?: string[] }
): Promise<DutyRosterTemplateInvalidateResult> {
	await assertAcceptedRunTemplateIsActive(ctx, input.runId);
	return invalidateAcceptedDutyRosterRuns(ctx, input);
}

async function invalidateAcceptedDutyRosterRuns(
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
	try {
		for (const target of targetRows) {
			updatedRows.push(
				await ctx.store.update<DutyRosterTemplateRunRow>(DUTY_ROSTER_TEMPLATE_RUN_TABLE, ctx.auth.orgId, target.id, {
					status: 'invalidated',
					invalidated_at: invalidatedAt,
					invalidated_by_user_id: ctx.auth.userId
				})
			);
		}
	} catch (error) {
		const rollbackErrors = await rollbackAcceptedDutyRosterRunInvalidationRows(ctx, updatedRows);
		if (rollbackErrors.length > 0) {
			throw invalidationRollbackFailureError(error, rollbackErrors, 'ctx.store.update');
		}
		throw error;
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
		const rollbackErrors = await rollbackAcceptedDutyRosterRunInvalidationRows(ctx, updatedRows);
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

async function assertAcceptedRunTemplateIsActive(ctx: WritePorts, runId: string): Promise<void> {
	const run = await ctx.store.findOne<{ template_id: string }>(DUTY_ROSTER_TEMPLATE_RUN_TABLE, ctx.auth.orgId, {
		id: runId
	});
	if (!run) {
		fail(404, 'Accepted Duty Roster Run not found');
	}

	const template = await ctx.store.findOne<DutyRosterTemplateRow>(DUTY_ROSTER_TEMPLATE_TABLE, ctx.auth.orgId, {
		id: run.template_id
	});
	if (template?.status === 'archived') {
		fail(400, 'Archived Duty Roster Templates cannot be applied to Calendar.');
	}
}

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

async function hydrateAcceptedRunCorrections(
	ctx: QueryPorts,
	runs: DutyRosterTemplateAcceptedRun[]
): Promise<DutyRosterTemplateAcceptedRun[]> {
	if (runs.length === 0) {
		return runs;
	}

	const correctionsByRunId = await loadDutyRosterRunCorrectionsByRunId(
		ctx,
		runs.map((run) => run.id)
	);
	const personnelById = await loadCorrectionPersonnelById(ctx, correctionsByRunId);

	return runs.map((run) => {
		const snapshot = parseAcceptedRunSnapshot(run.snapshotPayload);
		const corrections = (correctionsByRunId.get(run.id) ?? []).map((row) =>
			buildDutyRosterTemplateRunCorrectionReadModel({
				row,
				runStatus: run.status,
				snapshot,
				personnelById
			})
		);
		return {
			...run,
			corrections
		};
	});
}

type DisplayPersonnel = {
	id: string;
	rank: string;
	lastName: string;
	firstName: string;
	groupName?: string;
};

async function loadCorrectionPersonnelById(
	ctx: QueryPorts,
	correctionsByRunId: Map<string, DutyRosterTemplateRunCorrectionRow[]>
): Promise<Map<string, DutyRosterPoolPersonnel>> {
	const personnelIds = [
		...new Set(
			[...correctionsByRunId.values()]
				.flat()
				.flatMap((correction) => [correction.original_assignee_id, correction.replacement_assignee_id])
		)
	];
	const personnelById = new Map<string, DutyRosterPoolPersonnel>();
	if (personnelIds.length === 0) {
		return personnelById;
	}

	const personnel = await loadRosterPersonnel(ctx, {
		status: 'all',
		inFilters: { id: personnelIds }
	});
	for (const person of personnel) {
		const poolPerson = toDutyRosterPoolPersonnel(person);
		personnelById.set(poolPerson.id, poolPerson);
	}
	return personnelById;
}

function buildDutyRosterTemplateRunCorrectionReadModel(input: {
	row: DutyRosterTemplateRunCorrectionRow;
	runStatus: DutyRosterTemplateAcceptedRun['status'];
	snapshot: ReturnType<typeof parseAcceptedRunSnapshot>;
	personnelById?: Map<string, DutyRosterPoolPersonnel>;
}): DutyRosterTemplateRunCorrection {
	const poolOverrideReasons = dutyRosterCorrectionPoolOverrideReasons(
		input.snapshot,
		input.row.replacement_assignee_id
	);
	return {
		id: input.row.id,
		runId: input.row.run_id,
		runRowDate: input.row.run_row_date,
		originalAssigneeId: input.row.original_assignee_id,
		originalDisplay:
			snapshotPersonDisplay(input.snapshot, input.row.original_assignee_id) ??
			dbPersonnelDisplay(input.personnelById?.get(input.row.original_assignee_id)),
		replacementAssigneeId: input.row.replacement_assignee_id,
		replacementDisplay:
			snapshotPersonDisplay(input.snapshot, input.row.replacement_assignee_id) ??
			dbPersonnelDisplay(input.personnelById?.get(input.row.replacement_assignee_id)),
		reason: input.row.reason,
		correctedByUserId: input.row.corrected_by_user_id,
		correctedAt: input.row.corrected_at,
		countsTowardFuture: dutyRosterCorrectionCountsTowardFuture({ runStatus: input.runStatus }),
		poolOverride: poolOverrideReasons.length > 0,
		poolOverrideReasons
	};
}

function dutyRosterCorrectionPoolOverrideReasons(
	snapshot: ReturnType<typeof parseAcceptedRunSnapshot>,
	replacementAssigneeId: string
): DutyRosterCorrectionPoolOverrideReason[] {
	const resolvedPoolIds = new Set(snapshot.resolvedPool.map((person) => person.id));
	const exemptPersonnelIds = new Set(snapshot.config.exemptPersonnelIds ?? []);
	const reasons: DutyRosterCorrectionPoolOverrideReason[] = [];

	if (exemptPersonnelIds.has(replacementAssigneeId)) {
		reasons.push('exempt');
	} else if (!resolvedPoolIds.has(replacementAssigneeId)) {
		reasons.push('outside-pool');
	}

	return reasons;
}

function toCorrectionEffect(row: DutyRosterTemplateRunCorrectionRow) {
	return {
		runRowDate: row.run_row_date,
		replacementAssigneeId: row.replacement_assignee_id,
		reason: row.reason
	};
}

function snapshotPersonDisplay(
	snapshot: ReturnType<typeof parseAcceptedRunSnapshot>,
	personnelId: string | null
): DutyRosterTemplateRunCorrection['originalDisplay'] {
	if (!personnelId) return null;
	const person = snapshot.selectionPersonnel.find((candidate) => candidate.id === personnelId);
	if (!person) return null;

	return {
		id: person.id,
		rank: person.rank,
		lastName: person.lastName,
		firstName: person.firstName,
		groupName: person.groupName ?? ''
	};
}

function dbPersonnelDisplay(
	person: DisplayPersonnel | undefined
): DutyRosterTemplateRunCorrection['replacementDisplay'] {
	if (!person) return null;

	return {
		id: person.id,
		rank: person.rank,
		lastName: person.lastName,
		firstName: person.firstName,
		groupName: person.groupName ?? ''
	};
}

function toDutyRosterPoolPersonnel(person: Personnel): DutyRosterPoolPersonnel {
	return {
		id: person.id,
		rank: person.rank,
		lastName: person.lastName,
		firstName: person.firstName,
		mos: person.mos ?? '',
		dutyRole: person.clinicRole ?? '',
		groupId: person.groupId ?? null,
		groupName: person.groupName ?? '',
		archivedAt: person.archivedAt ?? null
	};
}

async function rollbackAcceptedDutyRosterRunInvalidationRows(
	ctx: WritePorts,
	updatedRows: DutyRosterTemplateRunRow[]
): Promise<unknown[]> {
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
	return rollbackErrors;
}

function invalidationRollbackFailureError(
	primaryError: unknown,
	rollbackErrors: unknown[],
	phase = 'cleanupAcceptedDutyRosterRunCalendarAssignmentsForInvalidation'
): Error {
	const error = new Error(
		`${phase} failed; failed to revert ${rollbackErrors.length} updatedRows using ctx.store.update on ${DUTY_ROSTER_TEMPLATE_RUN_TABLE}. Primary failure: ${errorMessage(primaryError)}. Rollback failures: ${rollbackErrors.map(errorMessage).join('; ')}.`
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

async function logAcceptedDutyRosterTemplateRun(ctx: WritePorts, runId: string): Promise<void> {
	await ctx.audit.log({
		action: 'duty_roster_template_run.accepted',
		resourceType: 'duty_roster_template_run',
		resourceId: runId
	});
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
	}
): Promise<never> {
	const rollbackErrors: unknown[] = [];
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
