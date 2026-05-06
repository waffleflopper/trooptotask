import { z } from 'zod';
import { fail } from '$lib/server/core/errors';
import type { QueryPorts, WritePorts } from '$lib/server/core/ports';
import {
	buildUniqueDutyRosterTemplateSlug,
	EMPTY_DUTY_ROSTER_POOL_CRITERIA,
	normalizeDutyRosterShortCode,
	normalizeDutyRosterTemplateName,
	normalizeDutyRosterTemplateSlug,
	type DutyRosterTemplate,
	type DutyRosterTemplateAcceptPreviewInput,
	type DutyRosterTemplateAcceptedRun,
	type DutyRosterTemplateConfiguredCreateInput,
	type DutyRosterTemplateCountReadModel,
	type DutyRosterTemplateCorrectionInput,
	type DutyRosterTemplateCreateInput,
	type DutyRosterTemplateGenerateInput,
	type DutyRosterTemplateManualSelectionInput,
	type DutyRosterTemplateRunCorrection,
	type DutyRosterTemplateSetupOptions,
	type DutyRosterTemplateSettingsData,
	type DutyRosterTemplateSettingsInput,
	type DutyRosterPoolPersonnel,
	type DutyRosterPoolCriteria
} from '$features/duty-roster/templates/dutyRosterTemplates';
import {
	buildDutyRosterBaselineRows,
	findInvalidDutyRosterSetupIds,
	normalizeDutyRosterPoolCriteria,
	resolveDutyRosterPool
} from '$features/duty-roster/templates/dutyRosterPool';
import {
	applyDutyRosterTemplateManualSelection,
	assertDutyRosterTemplatePreview,
	type DutyRosterTemplatePreview
} from '$features/duty-roster/templates/dutyRosterTemplatePreview';
import {
	acceptReviewedDutyRosterTemplatePreview,
	acceptAndApplyDutyRosterTemplatePreview as acceptAndApplyAcceptedRunLifecycle,
	applyAcceptedDutyRosterTemplateRun as applyAcceptedRunLifecycle,
	hasAcceptedDutyRosterTemplateRun,
	invalidateLatestDutyRosterTemplateRun as invalidateLatestRunLifecycle,
	listAcceptedDutyRosterTemplateRuns as listAcceptedRunsLifecycle,
	recordDutyRosterTemplateRunCorrection as recordRunCorrectionLifecycle
} from './acceptedRuns';
import {
	assertReviewedDutyRosterTemplatePreviewIsCurrent,
	buildDutyRosterTemplatePreviewFromCurrentState,
	listActiveDutyRosterPersonnel,
	loadDutyRosterTemplateCountReadModelSource,
	toDutyRosterTemplateCountReadModel
} from './templatePreviewAssembly';

const DUTY_ROSTER_TEMPLATE_TABLE = 'duty_roster_templates';
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
const configuredCreateIdentitySchema = settingsIdentitySchema.extend({
	name: z.string().trim().min(1, 'Name is required').max(120, 'Name must be 120 characters or fewer')
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

function parseConfiguredCreateIdentityInput(input: DutyRosterTemplateConfiguredCreateInput): {
	name: string;
	slug: string;
	shortCode: string | null;
} {
	const parsed = configuredCreateIdentitySchema.safeParse(input);
	if (!parsed.success) {
		fail(400, parsed.error.issues[0]?.message ?? 'Duty Roster Template identity input is invalid');
	}

	const name = normalizeDutyRosterTemplateName(parsed.data.name);
	return {
		name,
		slug: normalizeDutyRosterTemplateSlug(parsed.data.slug, name),
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

function validateDutyRosterTemplateSetupInput(input: {
	poolCriteria: DutyRosterPoolCriteria;
	exemptPersonnelIds: string[];
	manualBaselineCounts: Record<string, number | null | undefined>;
	resolvedPool: DutyRosterPoolPersonnel[];
}): {
	poolCriteria: DutyRosterPoolCriteria;
	exemptPersonnelIds: string[];
	manualBaselineCounts: Record<string, number>;
} {
	const poolCriteria = normalizeDutyRosterPoolCriteria(input.poolCriteria);
	const invalidBaselineCountValues = findInvalidBaselineCountValues(input.manualBaselineCounts);
	if (invalidBaselineCountValues.length > 0) {
		fail(400, 'Manual DA6 Baseline counts must be whole numbers zero or greater.');
	}

	const exemptPersonnelIds = normalizeStringArray(input.exemptPersonnelIds);
	const manualBaselineCounts = normalizeBaselineCounts(input.manualBaselineCounts);
	const invalid = findInvalidDutyRosterSetupIds({
		exemptPersonnelIds,
		manualBaselineCounts,
		resolvedPool: input.resolvedPool
	});

	if (invalid.invalidExemptionIds.length > 0) {
		fail(400, 'Duty exemptions must come from the resolved pool.');
	}

	if (invalid.invalidBaselineIds.length > 0) {
		fail(400, 'Manual DA6 Baseline counts can only be entered for resolved, non-exempt pool members.');
	}

	return {
		poolCriteria,
		exemptPersonnelIds,
		manualBaselineCounts
	};
}

async function insertDutyRosterTemplateWithAssignmentType(
	ctx: WritePorts,
	input: {
		templateId: string;
		name: string;
		slug: string;
		shortCode: string | null;
		poolCriteria: DutyRosterPoolCriteria;
		exemptPersonnelIds: string[];
		manualBaselineCounts: Record<string, number>;
		timestamp: string;
	}
): Promise<DutyRosterTemplateRow> {
	await ctx.store.insert<Record<string, unknown>>(ASSIGNMENT_TYPE_TABLE, ctx.auth.orgId, {
		id: input.templateId,
		name: input.name,
		short_name: defaultDutyRosterAssignmentShortName(input),
		assign_to: 'personnel',
		color: '#8a5a22',
		sort_order: 0,
		show_in_date_header: false,
		exempt_personnel_ids: []
	});

	try {
		return await ctx.store.insert<DutyRosterTemplateRow>(DUTY_ROSTER_TEMPLATE_TABLE, ctx.auth.orgId, {
			id: input.templateId,
			assignment_type_id: input.templateId,
			name: input.name,
			slug: input.slug,
			short_code: input.shortCode,
			status: 'active',
			pool_criteria: input.poolCriteria,
			exempt_personnel_ids: input.exemptPersonnelIds,
			manual_baseline_counts: input.manualBaselineCounts,
			created_by_user_id: ctx.auth.userId,
			created_at: input.timestamp,
			updated_at: input.timestamp
		});
	} catch (error) {
		await ctx.store.delete(ASSIGNMENT_TYPE_TABLE, ctx.auth.orgId, input.templateId);
		throw error;
	}
}

function logDutyRosterTemplateCreated(ctx: WritePorts, row: DutyRosterTemplateRow): void {
	ctx.audit.log({
		action: 'duty_roster_template.created',
		resourceType: 'duty_roster_template',
		resourceId: row.id
	});
}

export async function listDutyRosterTemplatesLifecycle(ctx: QueryPorts): Promise<DutyRosterTemplate[]> {
	const rows = await ctx.store.findMany<DutyRosterTemplateRow>(
		DUTY_ROSTER_TEMPLATE_TABLE,
		ctx.auth.orgId,
		{ status: 'active' },
		{ orderBy: [{ column: 'name', ascending: true }] }
	);

	return rows.map(toTemplate);
}

export async function findDutyRosterTemplateBySlugLifecycle(
	ctx: QueryPorts,
	slug: string
): Promise<DutyRosterTemplate | null> {
	const row = await ctx.store.findOne<DutyRosterTemplateRow>(DUTY_ROSTER_TEMPLATE_TABLE, ctx.auth.orgId, {
		slug,
		status: 'active'
	});

	return row ? toTemplate(row) : null;
}

export async function createDutyRosterTemplateLifecycle(
	ctx: WritePorts,
	input: DutyRosterTemplateCreateInput
): Promise<DutyRosterTemplate> {
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
			const row = await insertDutyRosterTemplateWithAssignmentType(ctx, {
				templateId,
				name: parsed.name,
				slug,
				shortCode: parsed.shortCode,
				poolCriteria: EMPTY_DUTY_ROSTER_POOL_CRITERIA,
				exemptPersonnelIds: [],
				manualBaselineCounts: {},
				timestamp: now
			});
			logDutyRosterTemplateCreated(ctx, row);

			return toTemplate(row);
		} catch (error) {
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

export async function createConfiguredDutyRosterTemplateLifecycle(
	ctx: WritePorts,
	input: DutyRosterTemplateConfiguredCreateInput
): Promise<DutyRosterTemplate> {
	const identity = parseConfiguredCreateIdentityInput(input);
	const slugRows = await ctx.store.findMany<{ id: string }>(DUTY_ROSTER_TEMPLATE_TABLE, ctx.auth.orgId, {
		slug: identity.slug
	});
	if (slugRows.length > 0) {
		fail(400, 'Duty Roster Template slug is already in use.');
	}

	const personnel = await listActiveDutyRosterPersonnel(ctx);
	const poolCriteria = normalizeDutyRosterPoolCriteria(input.poolCriteria);
	const resolvedPool = resolveDutyRosterPool({ criteria: poolCriteria, personnel });
	const setup = validateDutyRosterTemplateSetupInput({
		poolCriteria,
		exemptPersonnelIds: input.exemptPersonnelIds,
		manualBaselineCounts: input.manualBaselineCounts,
		resolvedPool
	});

	const templateId = crypto.randomUUID();
	const now = new Date().toISOString();

	try {
		const row = await insertDutyRosterTemplateWithAssignmentType(ctx, {
			templateId,
			name: identity.name,
			slug: identity.slug,
			shortCode: identity.shortCode,
			poolCriteria: setup.poolCriteria,
			exemptPersonnelIds: setup.exemptPersonnelIds,
			manualBaselineCounts: setup.manualBaselineCounts,
			timestamp: now
		});
		logDutyRosterTemplateCreated(ctx, row);

		return toTemplate(row);
	} catch (error) {
		if (isUniqueSlugError(error)) {
			fail(400, 'Duty Roster Template slug is already in use.');
		}
		throw error;
	}
}

export async function loadDutyRosterTemplateSettingsLifecycle(
	ctx: QueryPorts,
	template: DutyRosterTemplate
): Promise<DutyRosterTemplateSettingsData> {
	const personnel = await listActiveDutyRosterPersonnel(ctx);
	const resolvedPool = resolveDutyRosterPool({ criteria: template.poolCriteria, personnel });
	const baselineRows = buildDutyRosterBaselineRows({ template, resolvedPool });

	return {
		personnel,
		resolvedPool,
		baselineRows
	};
}

export async function loadDutyRosterTemplateSetupOptionsLifecycle(
	ctx: QueryPorts
): Promise<DutyRosterTemplateSetupOptions> {
	return {
		personnel: await listActiveDutyRosterPersonnel(ctx)
	};
}

export async function loadDutyRosterTemplateCountReadModelLifecycle(
	ctx: QueryPorts,
	template: DutyRosterTemplate
): Promise<DutyRosterTemplateCountReadModel> {
	const readModel = await loadDutyRosterTemplateCountReadModelSource(ctx, template);
	return toDutyRosterTemplateCountReadModel(readModel);
}

export async function listAcceptedDutyRosterTemplateRunsLifecycle(
	ctx: QueryPorts,
	templateId: string
): Promise<DutyRosterTemplateAcceptedRun[]> {
	return listAcceptedRunsLifecycle(ctx, templateId);
}

export async function updateDutyRosterTemplateSettingsLifecycle(
	ctx: WritePorts,
	input: DutyRosterTemplateSettingsInput
): Promise<DutyRosterTemplate> {
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
	const hasAcceptedRun = await hasAcceptedDutyRosterTemplateRun(ctx, input.templateId);
	if (hasAcceptedRun && !baselineCountsEqual(manualBaselineCounts, existingBaselineCounts)) {
		fail(400, 'Manual DA6 Baseline is locked after the first accepted run.');
	}

	const setup = validateDutyRosterTemplateSetupInput({
		poolCriteria,
		exemptPersonnelIds: input.exemptPersonnelIds,
		manualBaselineCounts: hasAcceptedRun ? {} : manualBaselineCounts,
		resolvedPool
	});

	await assertDutyRosterSettingsInvariantsAtWriteTime(ctx, {
		templateId: input.templateId,
		slug: identity.slug,
		manualBaselineCounts,
		existingBaselineCounts
	});

	let row: DutyRosterTemplateRow;
	try {
		row = await ctx.store.update<DutyRosterTemplateRow>(DUTY_ROSTER_TEMPLATE_TABLE, ctx.auth.orgId, input.templateId, {
			name: identity.name,
			slug: identity.slug,
			short_code: identity.shortCode,
			pool_criteria: setup.poolCriteria,
			exempt_personnel_ids: setup.exemptPersonnelIds,
			manual_baseline_counts: hasAcceptedRun ? existingBaselineCounts : manualBaselineCounts,
			updated_at: new Date().toISOString()
		});
	} catch (error) {
		if (isUniqueSlugError(error)) {
			fail(400, 'Duty Roster Template slug is already in use.');
		}
		throw error;
	}
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

async function assertDutyRosterSettingsInvariantsAtWriteTime(
	ctx: WritePorts,
	input: {
		templateId: string;
		slug: string;
		manualBaselineCounts: Record<string, number>;
		existingBaselineCounts: Record<string, number>;
	}
): Promise<void> {
	const slugRows = await ctx.store.findMany<{ id: string }>(DUTY_ROSTER_TEMPLATE_TABLE, ctx.auth.orgId, {
		slug: input.slug
	});
	if (slugRows.some((row) => row.id !== input.templateId)) {
		fail(400, 'Duty Roster Template slug is already in use.');
	}

	const hasAcceptedRun = await hasAcceptedDutyRosterTemplateRun(ctx, input.templateId);
	if (hasAcceptedRun && !baselineCountsEqual(input.manualBaselineCounts, input.existingBaselineCounts)) {
		fail(409, 'Manual DA6 Baseline is locked because this template accepted a run. Refresh settings and try again.');
	}
}

export async function generateDutyRosterTemplatePreviewLifecycle(
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

	const template = toTemplate(existing);
	return buildDutyRosterTemplatePreviewFromCurrentState(ctx, {
		template,
		startDate: parsed.startDate,
		endDate: parsed.endDate,
		generatedAt: new Date().toISOString()
	});
}

export async function acceptDutyRosterTemplatePreviewLifecycle(
	ctx: WritePorts,
	input: DutyRosterTemplateAcceptPreviewInput
): Promise<DutyRosterTemplateAcceptedRun> {
	return acceptReviewedDutyRosterTemplatePreview(ctx, {
		preview: await buildReviewedDutyRosterTemplatePreview(ctx, input)
	});
}

async function buildReviewedDutyRosterTemplatePreview(
	ctx: WritePorts,
	input: DutyRosterTemplateAcceptPreviewInput
): Promise<DutyRosterTemplatePreview> {
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
	let acceptedPreview = await buildDutyRosterTemplatePreviewFromCurrentState(ctx, {
		template: toTemplate(existing),
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

export async function applyAcceptedDutyRosterTemplateRunLifecycle(ctx: WritePorts, input: { runId: string }) {
	return applyAcceptedRunLifecycle(ctx, input);
}

export async function recordDutyRosterTemplateRunCorrectionLifecycle(
	ctx: WritePorts,
	input: DutyRosterTemplateCorrectionInput
): Promise<DutyRosterTemplateRunCorrection> {
	const parsed = parseCorrectionInput(input);
	return recordRunCorrectionLifecycle(ctx, parsed);
}

export async function invalidateLatestDutyRosterTemplateRunLifecycle(ctx: WritePorts, input: { runId: string }) {
	return invalidateLatestRunLifecycle(ctx, input);
}

export async function acceptAndApplyDutyRosterTemplatePreviewLifecycle(
	ctx: WritePorts,
	input: DutyRosterTemplateAcceptPreviewInput
) {
	return acceptAndApplyAcceptedRunLifecycle(ctx, {
		preview: await buildReviewedDutyRosterTemplatePreview(ctx, input)
	});
}

export async function applyDutyRosterTemplatePreviewManualSelectionLifecycle(
	ctx: WritePorts,
	input: DutyRosterTemplateManualSelectionInput
): Promise<DutyRosterTemplatePreview> {
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
