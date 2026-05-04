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
	type DutyRosterTemplate,
	type DutyRosterTemplateAcceptPreviewInput,
	type DutyRosterTemplateAcceptedRun,
	type DutyRosterTemplateCreateInput,
	type DutyRosterTemplateGenerateInput,
	type DutyRosterTemplateManualSelectionInput,
	type DutyRosterTemplateSettingsData,
	type DutyRosterTemplateSettingsInput,
	type DutyRosterPoolCriteria,
	type DutyRosterPoolPersonnel
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
import { AvailabilityEntryEntity } from '$lib/server/entities/availabilityEntry';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import { SpecialDayEntity } from '$lib/server/entities/specialDay';
import { StatusTypeEntity } from '$lib/server/entities/statusType';
import { batchDailyAssignments } from './dailyAssignmentsBatch';

const DUTY_ROSTER_TEMPLATE_TABLE = 'duty_roster_templates';
const DUTY_ROSTER_TEMPLATE_RUN_TABLE = 'duty_roster_template_runs';
const ASSIGNMENT_TYPE_TABLE = 'assignment_types';
const MAX_PREVIEW_DAYS = 62;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const createTemplateSchema = z.object({
	name: z.string().trim().min(1, 'Name is required').max(120, 'Name must be 120 characters or fewer'),
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
	status: 'accepted';
	start_date: string;
	end_date: string;
	snapshot_payload: Record<string, unknown>;
	accepted_by_user_id: string | null;
	accepted_at: string;
	applied_by_user_id: string | null;
	applied_at: string | null;
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
		snapshotPayload: row.snapshot_payload,
		createdAt: row.created_at
	};
}

function acceptedRunSnapshot(row: DutyRosterTemplateRunRow): DutyRosterTemplateAcceptedSnapshot {
	return row.snapshot_payload as unknown as DutyRosterTemplateAcceptedSnapshot;
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

function isUniqueSlugError(error: unknown): boolean {
	return error instanceof Error && /duplicate|unique|duty_roster_templates_org_slug_key/i.test(error.message);
}

function defaultDutyRosterAssignmentShortName(input: { name: string; shortCode: string | null }): string {
	return input.shortCode ?? input.name.slice(0, 12).trim().toUpperCase();
}

async function loadAcceptedContinuationHistory(ctx: QueryPorts, templateId: string) {
	const acceptedRunRows = await ctx.store.findMany<DutyRosterTemplateRunRow>(
		DUTY_ROSTER_TEMPLATE_RUN_TABLE,
		ctx.auth.orgId,
		{ template_id: templateId, status: 'accepted' },
		{ orderBy: [{ column: 'accepted_at', ascending: true }] }
	);

	return acceptedRunRows.map(acceptedRunSnapshot).map((snapshot) => acceptedSnapshotToContinuationHistory(snapshot));
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
	const [personnel, statusTypeRows, availabilityRows, specialDayRows, acceptedHistory] = await Promise.all([
		listActiveDutyRosterPersonnel(ctx),
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
		loadAcceptedContinuationHistory(ctx, input.template.id)
	]);

	return buildDutyRosterTemplatePreview({
		template: input.template,
		personnel,
		availabilityEntries: AvailabilityEntryEntity.fromDbArray(availabilityRows),
		statusTypes: StatusTypeEntity.fromDbArray(statusTypeRows),
		specialDays: SpecialDayEntity.fromDbArray(specialDayRows),
		acceptedHistory,
		startDate: input.startDate,
		endDate: input.endDate,
		generatedAt: input.generatedAt
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

export async function listAcceptedDutyRosterTemplateRuns(
	ctx: DutyRosterTemplateQueryPorts,
	templateId: string
): Promise<DutyRosterTemplateAcceptedRun[]> {
	await requireTemplateView(ctx);

	const rows = await ctx.store.findMany<DutyRosterTemplateRunRow>(
		DUTY_ROSTER_TEMPLATE_RUN_TABLE,
		ctx.auth.orgId,
		{ template_id: templateId, status: 'accepted' },
		{ orderBy: [{ column: 'accepted_at', ascending: false }] }
	);

	return rows.map(toAcceptedRun);
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
			pool_criteria: poolCriteria,
			exempt_personnel_ids: exemptPersonnelIds,
			manual_baseline_counts: hasAcceptedRun ? existingBaselineCounts : manualBaselineCounts,
			updated_at: new Date().toISOString()
		}
	);

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
	const snapshot = run.snapshotPayload as unknown as DutyRosterTemplateAcceptedSnapshot;
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
