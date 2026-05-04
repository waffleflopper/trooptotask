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
	type DutyRosterTemplateCreateInput,
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
import { PersonnelEntity } from '$lib/server/entities/personnel';

const DUTY_ROSTER_TEMPLATE_TABLE = 'duty_roster_templates';

const createTemplateSchema = z.object({
	name: z.string().trim().min(1, 'Name is required').max(120, 'Name must be 120 characters or fewer'),
	shortCode: z.string().trim().max(12, 'Short code must be 12 characters or fewer').nullable().optional()
});

type DutyRosterTemplateRow = {
	id: string;
	name: string;
	slug: string;
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

function isUniqueSlugError(error: unknown): boolean {
	return error instanceof Error && /duplicate|unique|duty_roster_templates_org_slug_key/i.test(error.message);
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
		const slug = buildUniqueDutyRosterTemplateSlug({
			name: parsed.name,
			existingSlugs: existingRows.map((row) => row.slug)
		});
		const now = new Date().toISOString();

		try {
			const row = await ctx.store.insert<DutyRosterTemplateRow>(DUTY_ROSTER_TEMPLATE_TABLE, ctx.auth.orgId, {
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
	const exemptPersonnelIds = normalizeStringArray(input.exemptPersonnelIds);
	const invalid = findInvalidDutyRosterSetupIds({
		exemptPersonnelIds,
		manualBaselineCounts,
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
			manual_baseline_counts: manualBaselineCounts,
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
