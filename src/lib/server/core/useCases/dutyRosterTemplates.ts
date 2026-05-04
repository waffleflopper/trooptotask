import { z } from 'zod';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';
import type { QueryPorts, UseCaseContext, WritePorts } from '$lib/server/core/ports';
import { requirePolicyDecision } from '$lib/server/core/useCases/policyAuthorization';
import {
	buildUniqueDutyRosterTemplateSlug,
	EMPTY_DUTY_ROSTER_POOL_CRITERIA,
	normalizeDutyRosterShortCode,
	normalizeDutyRosterTemplateName,
	normalizeDutyRosterTemplateSlug,
	type DutyRosterTemplate,
	type DutyRosterTemplateAcceptPreviewInput,
	type DutyRosterTemplateAcceptedRun,
	type DutyRosterTemplateCountReadModel,
	type DutyRosterTemplateCountRow,
	type DutyRosterTemplateCorrectionInput,
	type DutyRosterTemplateCreateInput,
	type DutyRosterTemplateGenerateInput,
	type DutyRosterTemplateManualSelectionInput,
	type DutyRosterTemplateRunCorrection,
	type DutyRosterTemplateSettingsData,
	type DutyRosterTemplateSettingsInput,
	type DutyRosterPoolCriteria,
	type DutyRosterPoolPersonnel,
	type DutyRosterPoolPersonnelDisplay
} from '$features/duty-roster/templates/dutyRosterTemplates';
import {
	buildDutyRosterBaselineRows,
	findInvalidDutyRosterSetupIds,
	normalizeDutyRosterPoolCriteria,
	resolveDutyRosterPool
} from '$features/duty-roster/templates/dutyRosterPool';
import {
	acceptedSnapshotToContinuationHistory,
	applyDutyRosterTemplateManualSelection,
	assertDutyRosterTemplatePreview,
	buildDutyRosterTemplateAcceptedSnapshot,
	buildDutyRosterTemplatePreview,
	type DutyRosterTemplateAcceptedSnapshot,
	type DutyRosterTemplatePreview
} from '$features/duty-roster/templates/dutyRosterTemplatePreview';
import type { DutyRosterContinuationHistoryItem } from '$features/duty-roster/run/dutyRosterRun.types';
import { AvailabilityEntryEntity } from '$lib/server/entities/availabilityEntry';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import { SpecialDayEntity } from '$lib/server/entities/specialDay';
import { StatusTypeEntity } from '$lib/server/entities/statusType';
import { batchDailyAssignments } from './dailyAssignmentsBatch';

const DUTY_ROSTER_TEMPLATE_TABLE = 'duty_roster_templates';
const DUTY_ROSTER_TEMPLATE_RUN_TABLE = 'duty_roster_template_runs';
const DUTY_ROSTER_TEMPLATE_CORRECTION_TABLE = 'duty_roster_template_run_corrections';
const ASSIGNMENT_TYPE_TABLE = 'assignment_types';
const MAX_PREVIEW_DAYS = 62;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const createTemplateSchema = z.object({
	name: z.string().trim().min(1, 'Name is required').max(120, 'Name must be 120 characters or fewer'),
	shortCode: z.string().trim().max(12, 'Short code must be 12 characters or fewer').nullable().optional()
});
const settingsIdentitySchema = z.object({
	name: z.string().trim().min(1, 'Name is required').max(120, 'Name must be 120 characters or fewer').optional(),
	slug: z.string().trim().max(72, 'Slug must be 72 characters or fewer').nullable().optional(),
	shortCode: z.string().trim().max(12, 'Short code must be 12 characters or fewer').nullable().optional()
});
const generatePreviewSchema = z
	.object({
		templateId: z.string().trim().min(1, 'Duty Roster Template is required'),
		startDate: z.string().refine(isValidDateOnly, 'Start date is required'),
		endDate: z.string().refine(isValidDateOnly, 'End date is required')
	})
	.refine((input) => input.endDate >= input.startDate, {
		message: 'End date must be on or after the start date',
		path: ['endDate']
	})
	.refine((input) => inclusiveDateSpan(input.startDate, input.endDate) <= MAX_PREVIEW_DAYS, {
		message: `Generate preview can cover ${MAX_PREVIEW_DAYS} days or fewer`,
		path: ['endDate']
	})
	.refine((input) => input.startDate >= currentDateOnly(), {
		message: 'Duty Roster previews cannot start in the past',
		path: ['startDate']
	});
const manualSelectionSchema = z.object({
	preview: z.string().trim().min(1, 'Generate the preview again before changing assignments.'),
	date: z.string().refine(isValidDateOnly, 'Duty date is required'),
	assigneeId: z.string().trim().min(1, 'Selected Soldier is required'),
	reason: z.string().trim().nullable().optional()
});
const acceptPreviewSchema = z.object({
	preview: z.string().trim().min(1, 'Generate the preview again before accepting.')
});
const correctionSchema = z.object({
	runId: z.string().trim().min(1, 'Accepted Duty Roster Run is required'),
	runRowDate: z.string().refine(isValidDateOnly, 'Duty date is required'),
	replacementAssigneeId: z.string().trim().min(1, 'Replacement Soldier is required'),
	reason: z.string().trim().min(1, 'Correction reason is required')
});

type DutyRosterTemplateRow = {
	id: string;
	name: string;
	slug: string;
	assignment_type_id: string;
	short_code: string | null;
	status: 'active' | 'archived';
	pool_criteria?: Record<string, unknown> | null;
	exempt_personnel_ids?: unknown[] | null;
	manual_baseline_counts?: Record<string, unknown> | null;
	created_at: string;
	updated_at: string;
};

type DutyRosterTemplateRunRow = {
	id: string;
	organization_id: string;
	template_id: string;
	template_name: string;
	status: 'accepted' | 'invalidated';
	start_date: string;
	end_date: string;
	snapshot_payload: Record<string, unknown>;
	accepted_by_user_id: string | null;
	accepted_at: string;
	applied_by_user_id: string | null;
	applied_at: string | null;
	invalidated_by_user_id: string | null;
	invalidated_at: string | null;
	created_at: string;
};

type DutyRosterTemplateRunCorrectionRow = {
	id: string;
	organization_id: string;
	run_id: string;
	run_row_date: string;
	original_assignee_id: string;
	replacement_assignee_id: string;
	reason: string;
	corrected_by_user_id: string | null;
	corrected_at: string;
	created_at: string;
};

function toTemplate(row: DutyRosterTemplateRow): DutyRosterTemplate {
	const poolCriteria = normalizePoolCriteriaFromDb(row.pool_criteria);
	return {
		id: row.id,
		assignmentTypeId: row.assignment_type_id ?? row.id,
		name: row.name,
		slug: row.slug,
		shortCode: row.short_code,
		status: row.status,
		poolCriteria,
		exemptPersonnelIds: normalizeStringArray(row.exempt_personnel_ids),
		manualBaselineCounts: normalizeBaselineCounts(row.manual_baseline_counts),
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

function toAcceptedRun(row: DutyRosterTemplateRunRow): DutyRosterTemplateAcceptedRun {
	return {
		id: row.id,
		templateId: row.template_id,
		templateName: row.template_name,
		status: row.status,
		startDate: row.start_date,
		endDate: row.end_date,
		acceptedAt: row.accepted_at,
		acceptedByUserId: row.accepted_by_user_id,
		appliedAt: row.applied_at ?? null,
		appliedByUserId: row.applied_by_user_id ?? null,
		invalidatedAt: row.invalidated_at ?? null,
		invalidatedByUserId: row.invalidated_by_user_id ?? null,
		linkedCalendarAssignmentCount: 0,
		calendarAssignmentsEdited: false,
		corrections: [],
		snapshotPayload: row.snapshot_payload,
		createdAt: row.created_at
	};
}

function parseAcceptedRunSnapshot(snapshotPayload: Record<string, unknown>): DutyRosterTemplateAcceptedSnapshot {
	if (snapshotPayload.snapshotVersion !== 1) {
		fail(500, 'Unsupported Duty Roster accepted snapshot version.');
	}

	return snapshotPayload as unknown as DutyRosterTemplateAcceptedSnapshot;
}

function acceptedRunSnapshot(row: DutyRosterTemplateRunRow): DutyRosterTemplateAcceptedSnapshot {
	return parseAcceptedRunSnapshot(row.snapshot_payload);
}

function snapshotPersonDisplay(
	snapshot: DutyRosterTemplateAcceptedSnapshot,
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
	person:
		| {
				id: string;
				rank: string;
				lastName: string;
				firstName: string;
				groupName?: string;
		  }
		| undefined
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

type DutyRosterTemplateLinkedCalendarAssignmentRow = {
	id: string;
	duty_roster_template_run_id: string;
	duty_roster_template_run_row_date: string | null;
	date: string;
	assignment_type_id: string;
	assignee_id: string;
};

function expectedCalendarAssignmentsByRowDate(
	run: DutyRosterTemplateAcceptedRun
): Map<string, { assignmentTypeId: string; assigneeId: string }> {
	const snapshot = run.snapshotPayload as unknown as DutyRosterTemplateAcceptedSnapshot;
	const expected = new Map<string, { assignmentTypeId: string; assigneeId: string }>();
	const correctionByDate = new Map(run.corrections.map((correction) => [correction.runRowDate, correction]));

	for (const row of snapshot.finalRows) {
		const assigneeId = correctionByDate.get(row.date)?.replacementAssigneeId ?? row.finalAssigneeId;
		if (!assigneeId) continue;
		expected.set(row.date, {
			assignmentTypeId: snapshot.template.id,
			assigneeId
		});
	}

	return expected;
}

function linkedCalendarAssignmentsWereEdited(
	run: DutyRosterTemplateAcceptedRun,
	rows: DutyRosterTemplateLinkedCalendarAssignmentRow[]
): boolean {
	if (!run.appliedAt) {
		return false;
	}

	const expected = expectedCalendarAssignmentsByRowDate(run);
	if (rows.length !== expected.size) {
		return true;
	}

	for (const row of rows) {
		const rowDate = row.duty_roster_template_run_row_date ?? row.date;
		const expectedRow = expected.get(rowDate);
		if (
			!expectedRow ||
			row.date !== rowDate ||
			row.assignment_type_id !== expectedRow.assignmentTypeId ||
			row.assignee_id !== expectedRow.assigneeId
		) {
			return true;
		}
	}

	return false;
}

function normalizePoolCriteriaFromDb(value: Record<string, unknown> | null | undefined): DutyRosterPoolCriteria {
	return normalizeDutyRosterPoolCriteria({
		rankValues: normalizeStringArray(value?.rankValues),
		groupIds: normalizeStringArray(value?.groupIds),
		mosValues: normalizeStringArray(value?.mosValues),
		dutyRoleValues: normalizeStringArray(value?.dutyRoleValues)
	});
}

function normalizeStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return [...new Set(value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean))];
}

function normalizeBaselineCounts(value: Record<string, unknown> | null | undefined): Record<string, number> {
	if (!value || typeof value !== 'object') {
		return {};
	}

	return Object.fromEntries(
		Object.entries(value)
			.map(([personId, count]) => [
				personId,
				typeof count === 'number' && Number.isInteger(count) && count >= 0 ? count : null
			])
			.filter((entry): entry is [string, number] => typeof entry[1] === 'number')
	);
}

function findInvalidBaselineCountValues(value: Record<string, unknown> | null | undefined): string[] {
	if (!value || typeof value !== 'object') {
		return [];
	}

	return Object.entries(value)
		.filter(([, count]) => count !== null && count !== undefined)
		.filter(([, count]) => typeof count !== 'number' || !Number.isInteger(count) || count < 0)
		.map(([personId]) => personId)
		.sort((a, b) => a.localeCompare(b));
}

function baselineCountsEqual(left: Record<string, number>, right: Record<string, number>): boolean {
	const leftEntries = Object.entries(left).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
	const rightEntries = Object.entries(right).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
	return JSON.stringify(leftEntries) === JSON.stringify(rightEntries);
}

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

function currentDateOnly(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

type DutyRosterTemplateQueryPorts = QueryPorts & Pick<UseCaseContext, 'audit'>;

async function requireTemplateView(ctx: DutyRosterTemplateQueryPorts): Promise<void> {
	await requirePolicyDecision({ auth: ctx.auth, audit: ctx.audit }, POLICY_ACTION_CATALOG.calendar.viewAvailability, {
		kind: 'unscoped'
	});
}

async function requireTemplateManagement(ctx: WritePorts): Promise<void> {
	await requirePolicyDecision(
		{ auth: ctx.auth, audit: ctx.audit, readOnlyGuard: ctx.readOnlyGuard },
		POLICY_ACTION_CATALOG.calendar.manageAssignments,
		{ kind: 'unscoped' }
	);
}

function parseCreateInput(input: DutyRosterTemplateCreateInput): {
	name: string;
	shortCode: string | null;
} {
	const parsed = createTemplateSchema.safeParse(input);
	if (!parsed.success) {
		fail(400, parsed.error.issues[0]?.message ?? 'Duty Roster Template input is invalid');
	}

	return {
		name: normalizeDutyRosterTemplateName(parsed.data.name),
		shortCode: normalizeDutyRosterShortCode(parsed.data.shortCode)
	};
}

function parseSettingsIdentityInput(
	input: DutyRosterTemplateSettingsInput,
	existing: DutyRosterTemplateRow
): {
	name: string;
	slug: string;
	shortCode: string | null;
} {
	const parsed = settingsIdentitySchema.safeParse(input);
	if (!parsed.success) {
		fail(400, parsed.error.issues[0]?.message ?? 'Duty Roster Template identity input is invalid');
	}

	const name = normalizeDutyRosterTemplateName(parsed.data.name ?? existing.name);
	return {
		name,
		slug: normalizeDutyRosterTemplateSlug(parsed.data.slug ?? existing.slug, name),
		shortCode:
			'shortCode' in parsed.data
				? normalizeDutyRosterShortCode(parsed.data.shortCode)
				: normalizeDutyRosterShortCode(existing.short_code)
	};
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

function isUniqueSlugError(error: unknown): boolean {
	return error instanceof Error && /duplicate|unique|duty_roster_templates_org_slug_key/i.test(error.message);
}

function defaultDutyRosterAssignmentShortName(input: { name: string; shortCode: string | null }): string {
	return input.shortCode ?? input.name.slice(0, 12).trim().toUpperCase();
}

type DutyRosterTemplateCountReadModelWithHistory = DutyRosterTemplateCountReadModel & {
	continuationHistory: DutyRosterContinuationHistoryItem[];
};

function poolDisplay(person: DutyRosterPoolPersonnel): DutyRosterPoolPersonnelDisplay {
	return {
		id: person.id,
		rank: person.rank,
		lastName: person.lastName,
		firstName: person.firstName,
		groupName: person.groupName
	};
}

function countSourceText(input: {
	source: DutyRosterTemplateCountReadModel['source'];
	invalidatedRunCount: number;
	countingCorrectionCount: number;
}): Pick<DutyRosterTemplateCountReadModel, 'sourceLabel' | 'sourceDescription'> {
	switch (input.source) {
		case 'accepted-history':
			return {
				sourceLabel: 'Accepted history',
				sourceDescription: [
					'Future previews use accepted, non-invalidated Duty Roster history.',
					'Manual accepted selections are treated as the final selection.',
					input.countingCorrectionCount > 0 ? 'Latest counting corrections use the Soldier who actually served.' : null,
					input.invalidatedRunCount > 0 ? 'Invalidated runs stay visible in History but do not affect counts.' : null
				]
					.filter((part): part is string => Boolean(part))
					.join(' ')
			};
		case 'manual-da6-baseline':
			return {
				sourceLabel: 'Manual DA6 Baseline',
				sourceDescription:
					'Future previews use Manual DA6 Baseline until this template has its first accepted Duty Roster Run.'
			};
		case 'da6-roster-order':
			return {
				sourceLabel: 'DA6 roster order',
				sourceDescription:
					'Future previews use DA6 roster order because this template has no accepted history or Manual DA6 Baseline counts.'
			};
	}
}

function countRowsFromHistory(
	history: DutyRosterContinuationHistoryItem[],
	resolvedPool: DutyRosterPoolPersonnel[]
): DutyRosterTemplateCountRow[] {
	const rowsById = new Map<string, DutyRosterTemplateCountRow>(
		resolvedPool.map((person) => [
			person.id,
			{
				personnelId: person.id,
				display: poolDisplay(person),
				count: 0,
				lastDutyDate: null
			}
		])
	);

	for (const historyItem of history) {
		for (const row of historyItem.roster) {
			if (!row.assigneeId) continue;

			const existing = rowsById.get(row.assigneeId) ?? {
				personnelId: row.assigneeId,
				display: row.assigneeName
					? {
							id: row.assigneeId,
							rank: row.assigneeRank ?? '',
							lastName: row.assigneeName.split(',')[0]?.trim() ?? row.assigneeName,
							firstName: row.assigneeName.split(',')[1]?.trim() ?? '',
							groupName: row.assigneeGroup ?? ''
						}
					: null,
				count: 0,
				lastDutyDate: null
			};
			rowsById.set(row.assigneeId, {
				...existing,
				count: existing.count + 1,
				lastDutyDate: !existing.lastDutyDate || row.date > existing.lastDutyDate ? row.date : existing.lastDutyDate
			});
		}
	}

	return [...rowsById.values()].sort(compareCountRows);
}

function countRowsFromBaseline(
	template: DutyRosterTemplate,
	resolvedPool: DutyRosterPoolPersonnel[]
): DutyRosterTemplateCountRow[] {
	return resolvedPool
		.map((person) => ({
			personnelId: person.id,
			display: poolDisplay(person),
			count: template.manualBaselineCounts[person.id] ?? 0,
			lastDutyDate: null
		}))
		.sort(compareCountRows);
}

function zeroCountRows(resolvedPool: DutyRosterPoolPersonnel[]): DutyRosterTemplateCountRow[] {
	return resolvedPool
		.map((person) => ({
			personnelId: person.id,
			display: poolDisplay(person),
			count: 0,
			lastDutyDate: null
		}))
		.sort(compareCountRows);
}

function compareCountRows(left: DutyRosterTemplateCountRow, right: DutyRosterTemplateCountRow): number {
	const leftLast = left.display?.lastName ?? '';
	const rightLast = right.display?.lastName ?? '';
	const lastNameComparison = leftLast.localeCompare(rightLast);
	if (lastNameComparison !== 0) return lastNameComparison;

	const leftFirst = left.display?.firstName ?? '';
	const rightFirst = right.display?.firstName ?? '';
	const firstNameComparison = leftFirst.localeCompare(rightFirst);
	if (firstNameComparison !== 0) return firstNameComparison;

	return left.personnelId.localeCompare(right.personnelId);
}

function buildBaselineContinuationHistory(
	template: DutyRosterTemplate,
	resolvedPool: DutyRosterPoolPersonnel[],
	startDate: string
): DutyRosterContinuationHistoryItem[] {
	const counts = Object.entries(template.manualBaselineCounts)
		.filter(([personnelId, count]) => count > 0 && resolvedPool.some((person) => person.id === personnelId))
		.sort(([left], [right]) => left.localeCompare(right));
	if (counts.length === 0) {
		return [];
	}

	const highestCount = Math.max(...counts.map(([, count]) => count));
	return [
		{
			assignmentTypeId: template.assignmentTypeId,
			startDate: shiftDate(startDate, -highestCount),
			endDate: shiftDate(startDate, -1),
			roster: counts.map(([personnelId, count]) => {
				const person = resolvedPool.find((candidate) => candidate.id === personnelId);
				return {
					date: shiftDate(startDate, -(highestCount - count + 1)),
					assigneeId: personnelId,
					assigneeName: person ? `${person.lastName}, ${person.firstName}` : null,
					assigneeRank: person?.rank ?? null,
					assigneeGroup: person?.groupName ?? null
				};
			}),
			config: {
				historySource: 'manual-da6-baseline'
			}
		}
	];
}

function shiftDate(value: string, offsetDays: number): string {
	const [yearValue, monthValue, dayValue] = value.split('-').map(Number);
	const date = new Date(Date.UTC(yearValue, monthValue - 1, dayValue + offsetDays));
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

async function loadTemplateCountReadModel(
	ctx: QueryPorts,
	template: DutyRosterTemplate,
	input: { baselineStartDate?: string; personnel?: DutyRosterPoolPersonnel[] } = {}
): Promise<DutyRosterTemplateCountReadModelWithHistory> {
	const personnelPromise = input.personnel ? Promise.resolve(input.personnel) : listActiveDutyRosterPersonnel(ctx);
	const [personnel, runRows] = await Promise.all([
		personnelPromise,
		ctx.store.findMany<DutyRosterTemplateRunRow>(
			DUTY_ROSTER_TEMPLATE_RUN_TABLE,
			ctx.auth.orgId,
			{ template_id: template.id },
			{
				inFilters: { status: ['accepted', 'invalidated'] },
				orderBy: [{ column: 'accepted_at', ascending: true }]
			}
		)
	]);
	const resolvedPool = resolveDutyRosterPool({ criteria: template.poolCriteria, personnel }).filter(
		(person) => !template.exemptPersonnelIds.includes(person.id)
	);
	const correctionsByRunId = await loadCorrectionsByRunId(
		ctx,
		runRows.map((row) => row.id)
	);
	const continuationHistory = runRows
		.filter((row) => row.status === 'accepted')
		.map((row) => acceptedSnapshotWithLatestCorrections(acceptedRunSnapshot(row), correctionsByRunId.get(row.id) ?? []))
		.map((snapshot) => acceptedSnapshotToContinuationHistory(snapshot));
	const acceptedRunCount = runRows.filter((row) => row.status === 'accepted').length;
	const invalidatedRunCount = runRows.filter((row) => row.status === 'invalidated').length;
	const statusByRunId = new Map(runRows.map((row) => [row.id, row.status]));
	const corrections = [...correctionsByRunId.values()].flat();
	const countingCorrectionCount = corrections.filter(
		(correction) => statusByRunId.get(correction.run_id) === 'accepted'
	).length;
	const nonCountingCorrectionCount = corrections.filter(
		(correction) => statusByRunId.get(correction.run_id) === 'invalidated'
	).length;
	const hasOfficialRunHistory = runRows.length > 0;
	const hasBaselineCounts = Object.values(template.manualBaselineCounts).some((count) => count > 0);
	const source: DutyRosterTemplateCountReadModel['source'] = hasOfficialRunHistory
		? 'accepted-history'
		: hasBaselineCounts
			? 'manual-da6-baseline'
			: 'da6-roster-order';
	const effectiveHistory =
		source === 'accepted-history'
			? continuationHistory
			: source === 'manual-da6-baseline' && input.baselineStartDate
				? buildBaselineContinuationHistory(template, resolvedPool, input.baselineStartDate)
				: [];
	const rows =
		source === 'accepted-history'
			? countRowsFromHistory(continuationHistory, resolvedPool)
			: source === 'manual-da6-baseline'
				? countRowsFromBaseline(template, resolvedPool)
				: zeroCountRows(resolvedPool);
	const text = countSourceText({ source, invalidatedRunCount, countingCorrectionCount });

	return {
		templateId: template.id,
		source,
		...text,
		rows,
		acceptedRunCount,
		invalidatedRunCount,
		countingCorrectionCount,
		nonCountingCorrectionCount,
		continuationHistory: effectiveHistory
	};
}

async function loadCorrectionsByRunId(
	ctx: QueryPorts,
	runIds: string[]
): Promise<Map<string, DutyRosterTemplateRunCorrectionRow[]>> {
	if (runIds.length === 0) {
		return new Map();
	}

	const rows = await ctx.store.findMany<DutyRosterTemplateRunCorrectionRow>(
		DUTY_ROSTER_TEMPLATE_CORRECTION_TABLE,
		ctx.auth.orgId,
		{},
		{
			inFilters: { run_id: runIds },
			orderBy: [
				{ column: 'run_row_date', ascending: true },
				{ column: 'corrected_at', ascending: true }
			]
		}
	);
	const correctionsByRunId = new Map<string, DutyRosterTemplateRunCorrectionRow[]>();
	for (const row of rows) {
		const runRows = correctionsByRunId.get(row.run_id) ?? [];
		runRows.push(row);
		correctionsByRunId.set(row.run_id, runRows);
	}

	return correctionsByRunId;
}

function latestCorrectionsByDate(
	corrections: DutyRosterTemplateRunCorrectionRow[]
): Map<string, DutyRosterTemplateRunCorrectionRow> {
	const latest = new Map<string, DutyRosterTemplateRunCorrectionRow>();
	for (const correction of corrections) {
		latest.set(correction.run_row_date, correction);
	}
	return latest;
}

function acceptedSnapshotWithLatestCorrections(
	snapshot: DutyRosterTemplateAcceptedSnapshot,
	corrections: DutyRosterTemplateRunCorrectionRow[]
): DutyRosterTemplateAcceptedSnapshot {
	const latest = latestCorrectionsByDate(corrections);
	if (latest.size === 0) {
		return snapshot;
	}

	return {
		...snapshot,
		finalRows: snapshot.finalRows.map((row) => {
			const correction = latest.get(row.date);
			if (!correction) return row;

			const replacementDisplay =
				snapshot.selectionPersonnel.find((person) => person.id === correction.replacement_assignee_id) ??
				(row.finalDisplay?.id === correction.replacement_assignee_id ? row.finalDisplay : null);
			return {
				...row,
				finalAssigneeId: correction.replacement_assignee_id,
				finalDisplay: replacementDisplay,
				reason: correction.reason
			};
		})
	};
}

async function buildTemplatePreviewFromCurrentState(
	ctx: QueryPorts,
	input: {
		template: DutyRosterTemplate;
		startDate: string;
		endDate: string;
		generatedAt?: string;
	}
): Promise<DutyRosterTemplatePreview> {
	const personnel = await listActiveDutyRosterPersonnel(ctx);
	const [statusTypeRows, availabilityRows, specialDayRows, countReadModel] = await Promise.all([
		ctx.store.findMany<Record<string, unknown>>('status_types', ctx.auth.orgId, undefined, {
			select: StatusTypeEntity.select,
			orderBy: [{ column: 'sort_order', ascending: true }]
		}),
		ctx.store.findMany<Record<string, unknown>>('availability_entries', ctx.auth.orgId, undefined, {
			select: AvailabilityEntryEntity.select,
			rangeFilters: [
				{ column: 'end_date', op: 'gte', value: input.startDate },
				{ column: 'start_date', op: 'lte', value: input.endDate }
			]
		}),
		ctx.store.findMany<Record<string, unknown>>('special_days', ctx.auth.orgId, undefined, {
			select: SpecialDayEntity.select,
			rangeFilters: [
				{ column: 'date', op: 'gte', value: input.startDate },
				{ column: 'date', op: 'lte', value: input.endDate }
			],
			orderBy: [{ column: 'date', ascending: true }]
		}),
		loadTemplateCountReadModel(ctx, input.template, { baselineStartDate: input.startDate, personnel })
	]);

	return buildDutyRosterTemplatePreview({
		template: input.template,
		personnel,
		availabilityEntries: AvailabilityEntryEntity.fromDbArray(availabilityRows),
		statusTypes: StatusTypeEntity.fromDbArray(statusTypeRows),
		specialDays: SpecialDayEntity.fromDbArray(specialDayRows),
		acceptedHistory: countReadModel.continuationHistory,
		startDate: input.startDate,
		endDate: input.endDate,
		generatedAt: input.generatedAt
	});
}

function reviewedPreviewPayload(preview: DutyRosterTemplatePreview): Record<string, unknown> {
	return {
		generatedAt: preview.generatedAt,
		assignmentType: preview.assignmentType,
		config: preview.config,
		personnel: preview.personnel,
		selectionPersonnel: preview.selectionPersonnel,
		rosterRows: preview.rosterRows,
		da6: preview.da6,
		exportModel: preview.exportModel,
		warnings: preview.warnings
	};
}

function assertReviewedPreviewStillCurrent(input: {
	reviewedPreview: DutyRosterTemplatePreview;
	currentPreview: DutyRosterTemplatePreview;
}): void {
	if (
		JSON.stringify(reviewedPreviewPayload(input.reviewedPreview)) !==
		JSON.stringify(reviewedPreviewPayload(input.currentPreview))
	) {
		fail(409, 'Duty Roster preview changed. Generate the preview again before accepting.');
	}
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

async function hydrateAcceptedRunCorrections(
	ctx: QueryPorts,
	runs: DutyRosterTemplateAcceptedRun[]
): Promise<DutyRosterTemplateAcceptedRun[]> {
	if (runs.length === 0) {
		return runs;
	}

	const correctionsByRunId = await loadCorrectionsByRunId(
		ctx,
		runs.map((run) => run.id)
	);
	const personnelIds = [
		...new Set(
			[...correctionsByRunId.values()]
				.flat()
				.flatMap((correction) => [correction.original_assignee_id, correction.replacement_assignee_id])
		)
	];
	const personnelById = new Map<string, DutyRosterPoolPersonnel>();
	if (personnelIds.length > 0) {
		const rows = await ctx.store.findMany<Record<string, unknown>>('personnel', ctx.auth.orgId, undefined, {
			inFilters: { id: personnelIds },
			select: PersonnelEntity.select
		});
		for (const person of PersonnelEntity.fromDbArray(rows)) {
			personnelById.set(person.id, {
				id: person.id,
				rank: person.rank,
				lastName: person.lastName,
				firstName: person.firstName,
				mos: person.mos ?? '',
				dutyRole: person.clinicRole ?? '',
				groupId: person.groupId ?? null,
				groupName: person.groupName ?? '',
				archivedAt: person.archivedAt ?? null
			});
		}
	}

	return runs.map((run) => {
		const snapshot = parseAcceptedRunSnapshot(run.snapshotPayload);
		const corrections = (correctionsByRunId.get(run.id) ?? []).map((correction) => ({
			id: correction.id,
			runId: correction.run_id,
			runRowDate: correction.run_row_date,
			originalAssigneeId: correction.original_assignee_id,
			originalDisplay:
				snapshotPersonDisplay(snapshot, correction.original_assignee_id) ??
				dbPersonnelDisplay(personnelById.get(correction.original_assignee_id)),
			replacementAssigneeId: correction.replacement_assignee_id,
			replacementDisplay:
				snapshotPersonDisplay(snapshot, correction.replacement_assignee_id) ??
				dbPersonnelDisplay(personnelById.get(correction.replacement_assignee_id)),
			reason: correction.reason,
			correctedByUserId: correction.corrected_by_user_id,
			correctedAt: correction.corrected_at,
			countsTowardFuture: run.status === 'accepted'
		}));
		return {
			...run,
			corrections
		};
	});
}

export async function listDutyRosterTemplates(ctx: DutyRosterTemplateQueryPorts): Promise<DutyRosterTemplate[]> {
	await requireTemplateView(ctx);

	const rows = await ctx.store.findMany<DutyRosterTemplateRow>(
		DUTY_ROSTER_TEMPLATE_TABLE,
		ctx.auth.orgId,
		{ status: 'active' },
		{ orderBy: [{ column: 'name', ascending: true }] }
	);

	return rows.map(toTemplate);
}

export async function findDutyRosterTemplateBySlug(
	ctx: DutyRosterTemplateQueryPorts,
	slug: string
): Promise<DutyRosterTemplate | null> {
	await requireTemplateView(ctx);

	const row = await ctx.store.findOne<DutyRosterTemplateRow>(DUTY_ROSTER_TEMPLATE_TABLE, ctx.auth.orgId, {
		slug,
		status: 'active'
	});

	return row ? toTemplate(row) : null;
}

export async function createDutyRosterTemplate(
	ctx: WritePorts,
	input: DutyRosterTemplateCreateInput
): Promise<DutyRosterTemplate> {
	await requireTemplateManagement(ctx);

	const parsed = parseCreateInput(input);
	let existingRows = await ctx.store.findMany<{ slug: string }>(
		DUTY_ROSTER_TEMPLATE_TABLE,
		ctx.auth.orgId,
		{},
		{ select: 'slug' }
	);

	for (let attempt = 0; attempt < 3; attempt += 1) {
		const templateId = crypto.randomUUID();
		const slug = buildUniqueDutyRosterTemplateSlug({
			name: parsed.name,
			existingSlugs: existingRows.map((row) => row.slug)
		});
		const now = new Date().toISOString();

		try {
			await ctx.store.insert<Record<string, unknown>>(ASSIGNMENT_TYPE_TABLE, ctx.auth.orgId, {
				id: templateId,
				name: parsed.name,
				short_name: defaultDutyRosterAssignmentShortName(parsed),
				assign_to: 'personnel',
				color: '#8a5a22',
				sort_order: 0,
				show_in_date_header: false,
				exempt_personnel_ids: []
			});

			const row = await ctx.store.insert<DutyRosterTemplateRow>(DUTY_ROSTER_TEMPLATE_TABLE, ctx.auth.orgId, {
				id: templateId,
				assignment_type_id: templateId,
				name: parsed.name,
				slug,
				short_code: parsed.shortCode,
				status: 'active',
				pool_criteria: EMPTY_DUTY_ROSTER_POOL_CRITERIA,
				exempt_personnel_ids: [],
				manual_baseline_counts: {},
				created_by_user_id: ctx.auth.userId,
				created_at: now,
				updated_at: now
			});

			ctx.audit.log({
				action: 'duty_roster_template.created',
				resourceType: 'duty_roster_template',
				resourceId: row.id
			});

			return toTemplate(row);
		} catch (error) {
			try {
				await ctx.store.delete(ASSIGNMENT_TYPE_TABLE, ctx.auth.orgId, templateId);
			} catch {
				// Best-effort cleanup for the companion Calendar assignment type after a failed template insert.
			}

			if (!isUniqueSlugError(error) || attempt === 2) {
				throw error;
			}

			existingRows = await ctx.store.findMany<{ slug: string }>(
				DUTY_ROSTER_TEMPLATE_TABLE,
				ctx.auth.orgId,
				{},
				{ select: 'slug' }
			);
		}
	}

	fail(500, 'Failed to create Duty Roster Template.');
}

export async function loadDutyRosterTemplateSettings(
	ctx: DutyRosterTemplateQueryPorts,
	template: DutyRosterTemplate
): Promise<DutyRosterTemplateSettingsData> {
	await requireTemplateView(ctx);

	const personnel = await listActiveDutyRosterPersonnel(ctx);
	const resolvedPool = resolveDutyRosterPool({ criteria: template.poolCriteria, personnel });
	const baselineRows = buildDutyRosterBaselineRows({ template, resolvedPool });

	return {
		personnel,
		resolvedPool,
		baselineRows
	};
}

export async function loadDutyRosterTemplateCountReadModel(
	ctx: DutyRosterTemplateQueryPorts,
	template: DutyRosterTemplate
): Promise<DutyRosterTemplateCountReadModel> {
	await requireTemplateView(ctx);
	const readModel = await loadTemplateCountReadModel(ctx, template);
	return {
		templateId: readModel.templateId,
		source: readModel.source,
		sourceLabel: readModel.sourceLabel,
		sourceDescription: readModel.sourceDescription,
		rows: readModel.rows,
		acceptedRunCount: readModel.acceptedRunCount,
		invalidatedRunCount: readModel.invalidatedRunCount,
		countingCorrectionCount: readModel.countingCorrectionCount,
		nonCountingCorrectionCount: readModel.nonCountingCorrectionCount
	};
}

export async function listAcceptedDutyRosterTemplateRuns(
	ctx: DutyRosterTemplateQueryPorts,
	templateId: string
): Promise<DutyRosterTemplateAcceptedRun[]> {
	await requireTemplateView(ctx);

	const rows = await ctx.store.findMany<DutyRosterTemplateRunRow>(
		DUTY_ROSTER_TEMPLATE_RUN_TABLE,
		ctx.auth.orgId,
		{ template_id: templateId },
		{
			inFilters: { status: ['accepted', 'invalidated'] },
			orderBy: [{ column: 'accepted_at', ascending: false }]
		}
	);

	const runsWithCorrections = await hydrateAcceptedRunCorrections(ctx, rows.map(toAcceptedRun));
	return hydrateAcceptedRunCalendarState(ctx, runsWithCorrections);
}

export async function updateDutyRosterTemplateSettings(
	ctx: WritePorts,
	input: DutyRosterTemplateSettingsInput
): Promise<DutyRosterTemplate> {
	await requireTemplateManagement(ctx);

	const existing = await ctx.store.findOne<DutyRosterTemplateRow>(DUTY_ROSTER_TEMPLATE_TABLE, ctx.auth.orgId, {
		id: input.templateId,
		status: 'active'
	});
	if (!existing) {
		fail(404, 'Duty Roster Template not found');
	}

	const identity = parseSettingsIdentityInput(input, existing);
	const slugRows = await ctx.store.findMany<{ id: string }>(DUTY_ROSTER_TEMPLATE_TABLE, ctx.auth.orgId, {
		slug: identity.slug
	});
	if (slugRows.some((row) => row.id !== input.templateId)) {
		fail(400, 'Duty Roster Template slug is already in use.');
	}

	const personnel = await listActiveDutyRosterPersonnel(ctx);
	const poolCriteria = normalizeDutyRosterPoolCriteria(input.poolCriteria);
	const resolvedPool = resolveDutyRosterPool({ criteria: poolCriteria, personnel });
	const invalidBaselineCountValues = findInvalidBaselineCountValues(input.manualBaselineCounts);
	if (invalidBaselineCountValues.length > 0) {
		fail(400, 'Manual DA6 Baseline counts must be whole numbers zero or greater.');
	}

	const manualBaselineCounts = normalizeBaselineCounts(input.manualBaselineCounts);
	const existingBaselineCounts = normalizeBaselineCounts(existing.manual_baseline_counts);
	const acceptedRuns = await ctx.store.findMany<{ id: string }>(
		DUTY_ROSTER_TEMPLATE_RUN_TABLE,
		ctx.auth.orgId,
		{ template_id: input.templateId, status: 'accepted' },
		{ select: 'id', limit: 1 }
	);
	const hasAcceptedRun = acceptedRuns.length > 0;
	if (hasAcceptedRun && !baselineCountsEqual(manualBaselineCounts, existingBaselineCounts)) {
		fail(400, 'Manual DA6 Baseline is locked after the first accepted run.');
	}

	const exemptPersonnelIds = normalizeStringArray(input.exemptPersonnelIds);
	const invalid = findInvalidDutyRosterSetupIds({
		exemptPersonnelIds,
		manualBaselineCounts: hasAcceptedRun ? {} : manualBaselineCounts,
		resolvedPool
	});

	if (invalid.invalidExemptionIds.length > 0) {
		fail(400, 'Duty exemptions must come from the resolved pool.');
	}

	if (invalid.invalidBaselineIds.length > 0) {
		fail(400, 'Manual DA6 Baseline counts can only be entered for resolved, non-exempt pool members.');
	}

	const row = await ctx.store.update<DutyRosterTemplateRow>(
		DUTY_ROSTER_TEMPLATE_TABLE,
		ctx.auth.orgId,
		input.templateId,
		{
			name: identity.name,
			slug: identity.slug,
			short_code: identity.shortCode,
			pool_criteria: poolCriteria,
			exempt_personnel_ids: exemptPersonnelIds,
			manual_baseline_counts: hasAcceptedRun ? existingBaselineCounts : manualBaselineCounts,
			updated_at: new Date().toISOString()
		}
	);
	await ctx.store.update<Record<string, unknown>>(ASSIGNMENT_TYPE_TABLE, ctx.auth.orgId, existing.assignment_type_id, {
		name: identity.name,
		short_name: defaultDutyRosterAssignmentShortName(identity)
	});

	ctx.audit.log({
		action: 'duty_roster_template.settings_updated',
		resourceType: 'duty_roster_template',
		resourceId: row.id
	});

	return toTemplate(row);
}

export async function generateDutyRosterTemplatePreview(
	ctx: WritePorts,
	input: DutyRosterTemplateGenerateInput
): Promise<DutyRosterTemplatePreview> {
	await requireTemplateManagement(ctx);

	const parsed = parseGenerateInput(input);
	const existing = await ctx.store.findOne<DutyRosterTemplateRow>(DUTY_ROSTER_TEMPLATE_TABLE, ctx.auth.orgId, {
		id: parsed.templateId,
		status: 'active'
	});
	if (!existing) {
		fail(404, 'Duty Roster Template not found');
	}

	const template = toTemplate(existing);
	return buildTemplatePreviewFromCurrentState(ctx, {
		template,
		startDate: parsed.startDate,
		endDate: parsed.endDate,
		generatedAt: new Date().toISOString()
	});
}

export async function acceptDutyRosterTemplatePreview(
	ctx: WritePorts,
	input: DutyRosterTemplateAcceptPreviewInput
): Promise<DutyRosterTemplateAcceptedRun> {
	await requireTemplateManagement(ctx);

	const parsed = parseAcceptPreviewInput(input);
	let preview: DutyRosterTemplatePreview;
	try {
		const parsedPreview: unknown = JSON.parse(parsed.preview);
		assertDutyRosterTemplatePreview(parsedPreview);
		preview = parsedPreview;
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
	let acceptedPreview = await buildTemplatePreviewFromCurrentState(ctx, {
		template: toTemplate(existing),
		startDate: previewRange.startDate,
		endDate: previewRange.endDate,
		generatedAt: preview.generatedAt
	});
	assertReviewedPreviewStillCurrent({
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

	const acceptedAt = new Date().toISOString();
	const snapshot = buildDutyRosterTemplateAcceptedSnapshot({
		preview: acceptedPreview,
		acceptedAt,
		acceptedByUserId: ctx.auth.userId
	});
	const inserted = await ctx.store.insert<DutyRosterTemplateRunRow>(DUTY_ROSTER_TEMPLATE_RUN_TABLE, ctx.auth.orgId, {
		template_id: acceptedPreview.assignmentType.id,
		template_name: acceptedPreview.assignmentType.name,
		status: 'accepted',
		start_date: acceptedPreview.config.startDate,
		end_date: acceptedPreview.config.endDate,
		snapshot_payload: snapshot as unknown as Record<string, unknown>,
		accepted_by_user_id: ctx.auth.userId,
		accepted_at: acceptedAt,
		created_at: acceptedAt
	});

	await ctx.audit.log({
		action: 'duty_roster_template_run.accepted',
		resourceType: 'duty_roster_template_run',
		resourceId: inserted.id
	});

	return toAcceptedRun(inserted);
}

type DutyRosterTemplateApplyResult = {
	acceptedRun: DutyRosterTemplateAcceptedRun;
	insertedCount: number;
	clearedCount: number;
};

function applyRecordsFromAcceptedRun(run: DutyRosterTemplateAcceptedRun) {
	const snapshot = parseAcceptedRunSnapshot(run.snapshotPayload);
	return snapshot.finalRows.map((row) => ({
		date: row.date,
		assignmentTypeId: snapshot.template.id,
		assigneeId: row.finalAssigneeId ?? '',
		dutyRosterTemplateRunId: run.id,
		dutyRosterTemplateRunRowDate: row.date
	}));
}

async function applyAcceptedDutyRosterTemplateRunRecord(
	ctx: WritePorts,
	run: DutyRosterTemplateAcceptedRun
): Promise<DutyRosterTemplateApplyResult> {
	await requireTemplateManagement(ctx);
	if (run.appliedAt) {
		fail(400, 'Accepted Duty Roster Run has already been applied to Calendar.');
	}

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

	await ctx.audit.log({
		action: 'duty_roster_template_run.applied_to_calendar',
		resourceType: 'duty_roster_template_run',
		resourceId: run.id,
		details: {
			inserted: result.inserted.length,
			cleared: result.cleared
		}
	});

	return {
		acceptedRun: toAcceptedRun(updated),
		insertedCount: result.inserted.length,
		clearedCount: result.cleared
	};
}

export async function applyAcceptedDutyRosterTemplateRun(
	ctx: WritePorts,
	input: { runId: string }
): Promise<DutyRosterTemplateApplyResult> {
	await requireTemplateManagement(ctx);

	const row = await ctx.store.findOne<DutyRosterTemplateRunRow>(DUTY_ROSTER_TEMPLATE_RUN_TABLE, ctx.auth.orgId, {
		id: input.runId,
		status: 'accepted'
	});
	if (!row) {
		fail(404, 'Accepted Duty Roster Run not found');
	}

	return applyAcceptedDutyRosterTemplateRunRecord(ctx, toAcceptedRun(row));
}

export async function recordDutyRosterTemplateRunCorrection(
	ctx: WritePorts,
	input: DutyRosterTemplateCorrectionInput
): Promise<DutyRosterTemplateRunCorrection> {
	await requireTemplateManagement(ctx);

	const parsed = parseCorrectionInput(input);
	const row = await ctx.store.findOne<DutyRosterTemplateRunRow>(DUTY_ROSTER_TEMPLATE_RUN_TABLE, ctx.auth.orgId, {
		id: parsed.runId
	});
	if (!row) {
		fail(404, 'Accepted Duty Roster Run not found');
	}
	if (row.status === 'invalidated') {
		fail(400, 'Invalidated Duty Roster Runs cannot be corrected.');
	}
	if (!row.applied_at) {
		fail(400, 'Only applied Duty Roster Runs can be corrected.');
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
		{ orderBy: [{ column: 'corrected_at', ascending: false }], limit: 1 }
	);
	const currentEffectiveAssigneeId = latestCorrections[0]?.replacement_assignee_id ?? acceptedRow.finalAssigneeId;
	if (currentEffectiveAssigneeId === parsed.replacementAssigneeId) {
		fail(400, 'Replacement Soldier must differ from the current Soldier.');
	}

	const replacement = await ctx.store.findOne<Record<string, unknown>>('personnel', ctx.auth.orgId, {
		id: parsed.replacementAssigneeId,
		archived_at: null
	});
	if (!replacement) {
		fail(400, 'Replacement Soldier is missing or archived.');
	}

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
		await batchDailyAssignments(ctx, {
			records: [
				{
					date: parsed.runRowDate,
					assignmentTypeId: snapshot.template.id,
					assigneeId: parsed.replacementAssigneeId,
					dutyRosterTemplateRunId: row.id,
					dutyRosterTemplateRunRowDate: parsed.runRowDate
				}
			]
		});
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
			calendarSynced: Boolean(row.applied_at)
		}
	});

	return {
		id: inserted.id,
		runId: inserted.run_id,
		runRowDate: inserted.run_row_date,
		originalAssigneeId: inserted.original_assignee_id,
		originalDisplay: snapshotPersonDisplay(snapshot, inserted.original_assignee_id),
		replacementAssigneeId: inserted.replacement_assignee_id,
		replacementDisplay:
			snapshotPersonDisplay(snapshot, inserted.replacement_assignee_id) ??
			dbPersonnelDisplay(PersonnelEntity.fromDb(replacement)),
		reason: inserted.reason,
		correctedByUserId: inserted.corrected_by_user_id,
		correctedAt: inserted.corrected_at,
		countsTowardFuture: true
	};
}

type DutyRosterTemplateInvalidateResult = {
	invalidatedRun: DutyRosterTemplateAcceptedRun;
	removedCalendarAssignments: number;
	calendarAssignmentsEdited: boolean;
};

export async function invalidateLatestDutyRosterTemplateRun(
	ctx: WritePorts,
	input: { runId: string }
): Promise<DutyRosterTemplateInvalidateResult> {
	await requireTemplateManagement(ctx);

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

	const acceptedRun = toAcceptedRun(row);
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
		invalidatedRun: toAcceptedRun(updated),
		removedCalendarAssignments: calendarRemoval.cleared,
		calendarAssignmentsEdited
	};
}

export async function acceptAndApplyDutyRosterTemplatePreview(
	ctx: WritePorts,
	input: DutyRosterTemplateAcceptPreviewInput
): Promise<DutyRosterTemplateApplyResult> {
	const acceptedRun = await acceptDutyRosterTemplatePreview(ctx, input);
	return applyAcceptedDutyRosterTemplateRunRecord(ctx, acceptedRun);
}

export async function applyDutyRosterTemplatePreviewManualSelection(
	ctx: WritePorts,
	input: DutyRosterTemplateManualSelectionInput
): Promise<DutyRosterTemplatePreview> {
	await requireTemplateManagement(ctx);

	const parsed = parseManualSelectionInput(input);
	let preview: unknown;
	try {
		preview = JSON.parse(parsed.preview);
		assertDutyRosterTemplatePreview(preview);
		return applyDutyRosterTemplateManualSelection(preview, {
			date: parsed.date,
			assigneeId: parsed.assigneeId,
			reason: parsed.reason
		});
	} catch (errorValue) {
		fail(400, errorValue instanceof Error ? errorValue.message : 'Manual selection input is invalid');
	}
}

async function listActiveDutyRosterPersonnel(ctx: QueryPorts): Promise<DutyRosterPoolPersonnel[]> {
	const rows = await ctx.store.findMany<Record<string, unknown>>(
		'personnel',
		ctx.auth.orgId,
		{},
		{
			select: PersonnelEntity.select,
			isNull: { archived_at: true },
			orderBy: [
				{ column: 'last_name', ascending: true },
				{ column: 'first_name', ascending: true }
			]
		}
	);

	return PersonnelEntity.fromDbArray(rows).map((person) => ({
		id: person.id,
		rank: person.rank,
		lastName: person.lastName,
		firstName: person.firstName,
		mos: person.mos ?? '',
		dutyRole: person.clinicRole ?? '',
		groupId: person.groupId ?? null,
		groupName: person.groupName ?? '',
		archivedAt: person.archivedAt ?? null
	}));
}
