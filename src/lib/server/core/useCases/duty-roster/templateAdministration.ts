import { z } from 'zod';
import { compareRankCodes, type RankCatalogEntry } from '$lib/domain/rankCatalog';
import { fail } from '$lib/server/core/errors';
import type { QueryPorts, WritePorts } from '$lib/server/core/ports';
import {
	buildUniqueDutyRosterTemplateSlug,
	EMPTY_DUTY_ROSTER_POOL_CRITERIA,
	normalizeDutyRosterShortCode,
	normalizeDutyRosterTemplateName,
	normalizeDutyRosterTemplateSlug,
	type DutyRosterTemplate,
	type DutyRosterTemplateArchiveInput,
	type DutyRosterTemplateConfiguredCreateInput,
	type DutyRosterTemplateCreateInput,
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
	hasAcceptedDutyRosterTemplateRun,
	loadAcceptedDutyRosterTemplateRunPersonnelIds
} from './acceptedRunLifecycle';
import { listActiveDutyRosterPersonnel } from './templatePreviewAssembly';
import {
	DUTY_ROSTER_TEMPLATE_TABLE,
	findInvalidBaselineCountValues,
	normalizeBaselineCounts,
	normalizeStringArray,
	toDutyRosterTemplate,
	type DutyRosterTemplateRow
} from './templateRecord';

const ASSIGNMENT_TYPE_TABLE = 'assignment_types';
const RANK_CATALOG_TABLE = 'organization_rank_catalog';

interface DutyRosterRankCatalogRow extends Record<string, unknown> {
	code: string;
	label: string;
	service: RankCatalogEntry['service'];
	category: RankCatalogEntry['category'];
	pay_grade: RankCatalogEntry['payGrade'];
	state: RankCatalogEntry['state'];
	sort_order: number;
}

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
const archiveTemplateSchema = z.object({
	templateId: z.string().trim().min(1, 'Duty Roster Template is required'),
	archiveAssignmentType: z.boolean().optional().default(false)
});

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

function parseArchiveInput(input: DutyRosterTemplateArchiveInput): Required<DutyRosterTemplateArchiveInput> {
	const parsed = archiveTemplateSchema.safeParse(input);
	if (!parsed.success) {
		fail(400, parsed.error.issues[0]?.message ?? 'Duty Roster Template archive input is invalid');
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

export async function listDutyRosterTemplates(ctx: QueryPorts): Promise<DutyRosterTemplate[]> {
	const rows = await ctx.store.findMany<DutyRosterTemplateRow>(
		DUTY_ROSTER_TEMPLATE_TABLE,
		ctx.auth.orgId,
		{},
		{
			inFilters: { status: ['active', 'archived'] },
			orderBy: [
				{ column: 'status', ascending: true },
				{ column: 'name', ascending: true }
			]
		}
	);

	return rows.map(toDutyRosterTemplate).sort(compareDutyRosterTemplatesForRegister);
}

function compareDutyRosterTemplatesForRegister(left: DutyRosterTemplate, right: DutyRosterTemplate): number {
	const statusComparison = templateStatusOrder(left.status) - templateStatusOrder(right.status);
	return statusComparison || left.name.localeCompare(right.name);
}

function templateStatusOrder(status: DutyRosterTemplate['status']): number {
	return status === 'active' ? 0 : 1;
}

export async function findDutyRosterTemplateBySlug(ctx: QueryPorts, slug: string): Promise<DutyRosterTemplate | null> {
	const row = await ctx.store.findOne<DutyRosterTemplateRow>(DUTY_ROSTER_TEMPLATE_TABLE, ctx.auth.orgId, {
		slug
	});

	return row ? toDutyRosterTemplate(row) : null;
}

export async function createDutyRosterTemplate(
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

			return toDutyRosterTemplate(row);
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

export async function createConfiguredDutyRosterTemplate(
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

		return toDutyRosterTemplate(row);
	} catch (error) {
		if (isUniqueSlugError(error)) {
			fail(400, 'Duty Roster Template slug is already in use.');
		}
		throw error;
	}
}

export async function loadDutyRosterTemplateSettings(
	ctx: QueryPorts,
	template: DutyRosterTemplate
): Promise<DutyRosterTemplateSettingsData> {
	const [personnel, rankCatalog] = await Promise.all([
		listActiveDutyRosterPersonnel(ctx),
		loadDutyRosterRankCatalog(ctx)
	]);
	const resolvedPool = resolveDutyRosterPool({ criteria: template.poolCriteria, personnel });
	const baselineRows = buildDutyRosterBaselineRows({ template, resolvedPool });

	return {
		personnel,
		resolvedPool,
		baselineRows,
		rankCatalog
	};
}

export async function loadDutyRosterTemplateSetupOptions(ctx: QueryPorts): Promise<DutyRosterTemplateSetupOptions> {
	const [personnel, rankCatalog] = await Promise.all([
		listActiveDutyRosterPersonnel(ctx),
		loadDutyRosterRankCatalog(ctx)
	]);

	return {
		personnel,
		rankCatalog
	};
}

async function loadDutyRosterRankCatalog(ctx: QueryPorts): Promise<RankCatalogEntry[]> {
	const rows = await ctx.store.findMany<DutyRosterRankCatalogRow>(RANK_CATALOG_TABLE, ctx.auth.orgId);
	const catalog = rows.map((row) => ({
		code: row.code,
		label: row.label,
		service: row.service,
		category: row.category,
		payGrade: row.pay_grade,
		state: row.state,
		sortOrder: row.sort_order
	}));

	return catalog.toSorted((left, right) => compareRankCodes(left.code, right.code, { catalog }));
}

export async function updateDutyRosterTemplateSettings(
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
	const assignmentTypeId = existing.assignment_type_id ?? existing.id;

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
	const acceptedRunPersonnelIds = hasAcceptedRun
		? await loadAcceptedDutyRosterTemplateRunPersonnelIds(ctx, input.templateId)
		: new Set<string>();
	const lockedBaselineIds = changedLockedBaselineIds({
		submittedBaselineCounts: manualBaselineCounts,
		existingBaselineCounts,
		lockedPersonnelIds: acceptedRunPersonnelIds
	});
	if (lockedBaselineIds.length > 0) {
		fail(400, 'Manual DA6 Baseline is locked for Soldiers who already appeared in accepted history.');
	}
	const editableBaselineCounts = baselineCountsExcludingLockedPersonnel(manualBaselineCounts, acceptedRunPersonnelIds);
	const nextBaselineCounts = hasAcceptedRun
		? mergeBaselineCountsForAcceptedHistory({
				existingBaselineCounts,
				submittedBaselineCounts: manualBaselineCounts,
				lockedPersonnelIds: acceptedRunPersonnelIds
			})
		: manualBaselineCounts;

	const setup = validateDutyRosterTemplateSetupInput({
		poolCriteria,
		exemptPersonnelIds: input.exemptPersonnelIds,
		manualBaselineCounts: hasAcceptedRun ? editableBaselineCounts : manualBaselineCounts,
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
			manual_baseline_counts: nextBaselineCounts,
			updated_at: new Date().toISOString()
		});
	} catch (error) {
		if (isUniqueSlugError(error)) {
			fail(400, 'Duty Roster Template slug is already in use.');
		}
		throw error;
	}
	await ctx.store.update<Record<string, unknown>>(ASSIGNMENT_TYPE_TABLE, ctx.auth.orgId, assignmentTypeId, {
		name: identity.name,
		short_name: defaultDutyRosterAssignmentShortName(identity)
	});

	ctx.audit.log({
		action: 'duty_roster_template.settings_updated',
		resourceType: 'duty_roster_template',
		resourceId: row.id
	});

	return toDutyRosterTemplate(row);
}

export async function archiveDutyRosterTemplate(
	ctx: WritePorts,
	input: DutyRosterTemplateArchiveInput
): Promise<DutyRosterTemplate> {
	const parsed = parseArchiveInput(input);
	const existing = await ctx.store.findOne<DutyRosterTemplateRow>(DUTY_ROSTER_TEMPLATE_TABLE, ctx.auth.orgId, {
		id: parsed.templateId,
		status: 'active'
	});
	if (!existing) {
		fail(404, 'Duty Roster Template not found');
	}
	const assignmentTypeId = existing.assignment_type_id ?? existing.id;

	const archivedAt = new Date().toISOString();
	const row = await ctx.store.update<DutyRosterTemplateRow>(
		DUTY_ROSTER_TEMPLATE_TABLE,
		ctx.auth.orgId,
		parsed.templateId,
		{
			status: 'archived',
			archived_at: archivedAt,
			updated_at: archivedAt
		}
	);

	if (parsed.archiveAssignmentType) {
		await ctx.store.update<Record<string, unknown>>(ASSIGNMENT_TYPE_TABLE, ctx.auth.orgId, assignmentTypeId, {
			archived_at: archivedAt
		});
	}

	ctx.audit.log({
		action: 'duty_roster_template.archived',
		resourceType: 'duty_roster_template',
		resourceId: row.id,
		details: {
			archiveAssignmentType: parsed.archiveAssignmentType,
			assignmentTypeId
		}
	});

	return toDutyRosterTemplate(row);
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
	if (hasAcceptedRun) {
		const acceptedRunPersonnelIds = await loadAcceptedDutyRosterTemplateRunPersonnelIds(ctx, input.templateId);
		const lockedBaselineIds = changedLockedBaselineIds({
			submittedBaselineCounts: input.manualBaselineCounts,
			existingBaselineCounts: input.existingBaselineCounts,
			lockedPersonnelIds: acceptedRunPersonnelIds
		});
		if (lockedBaselineIds.length > 0) {
			fail(409, 'Manual DA6 Baseline is locked because this template accepted a run. Refresh settings and try again.');
		}
	}
}

function changedLockedBaselineIds(input: {
	submittedBaselineCounts: Record<string, number>;
	existingBaselineCounts: Record<string, number>;
	lockedPersonnelIds: Set<string>;
}): string[] {
	return [...input.lockedPersonnelIds]
		.filter((personnelId) => {
			const submitted = baselineCount(input.submittedBaselineCounts, personnelId);
			return submitted !== null && submitted !== baselineCount(input.existingBaselineCounts, personnelId);
		})
		.sort((left, right) => left.localeCompare(right));
}

function baselineCountsExcludingLockedPersonnel(
	counts: Record<string, number>,
	lockedPersonnelIds: Set<string>
): Record<string, number> {
	return Object.fromEntries(Object.entries(counts).filter(([personnelId]) => !lockedPersonnelIds.has(personnelId)));
}

function mergeBaselineCountsForAcceptedHistory(input: {
	existingBaselineCounts: Record<string, number>;
	submittedBaselineCounts: Record<string, number>;
	lockedPersonnelIds: Set<string>;
}): Record<string, number> {
	return {
		...baselineCountsForLockedPersonnel(input.existingBaselineCounts, input.lockedPersonnelIds),
		...baselineCountsExcludingLockedPersonnel(input.submittedBaselineCounts, input.lockedPersonnelIds)
	};
}

function baselineCountsForLockedPersonnel(
	counts: Record<string, number>,
	lockedPersonnelIds: Set<string>
): Record<string, number> {
	return Object.fromEntries(Object.entries(counts).filter(([personnelId]) => lockedPersonnelIds.has(personnelId)));
}

function baselineCount(counts: Record<string, number>, personnelId: string): number | null {
	return counts[personnelId] ?? null;
}
