import { createHash } from 'node:crypto';
import { POLICY_ACTION_CATALOG, type PolicyAction } from '$lib/access/policyEvaluator';
import { evaluateAuthoritativePolicyDecision } from '$lib/server/core/useCases/policyAdapter';
import { requirePolicyDecision } from '$lib/server/core/useCases/policyAuthorization';
import { fail } from '$lib/server/core/errors';
import type { UseCaseContext, WritePorts } from '$lib/server/core/ports';
import { createCrudUseCases } from '$lib/server/core/useCases/crud';
import { createOnboardingTemplate } from './onboardingTemplateCrud';
import { createConfiguredDutyRosterTemplate } from './dutyRosterTemplates';
import { getEntityAuditResource } from '$lib/server/entitySchema';
import {
	buildUniqueDutyRosterTemplateSlug,
	EMPTY_DUTY_ROSTER_POOL_CRITERIA,
	type DutyRosterTemplate
} from '$features/duty-roster/templates/dutyRosterTemplates';
import { TrainingTypeEntity } from '$lib/server/entities/trainingType';
import type { OnboardingTemplate } from '$features/onboarding/onboarding.types';
import type { TrainingType } from '$features/training/training.types';
import type {
	StarterConfigurationPackApplyResult,
	StarterConfigurationPackArtifactFamilyId,
	StarterConfigurationPackId,
	StarterConfigurationPackResultItem,
	StarterConfigurationPackSupport
} from '$lib/types/starterConfigurationPacks';

const PACK_ID: StarterConfigurationPackId = 'first-week-operations';
const PACK_NAME = 'First Week Operations';
const PACK_DESCRIPTION =
	'Optional starter configuration for common first-week setup. Owners can edit or remove every artifact after applying it.';
const PACK_EDITABLE_COPY = 'Creates editable Training Types, onboarding steps, and a Duty Roster template scaffold.';
const SUPPORT_SAFE_FAILURE = 'This starter artifact could not be created. Existing configuration was left unchanged.';

const REQUIRED_CONFIGURE_ACTIONS = [
	POLICY_ACTION_CATALOG.training.configureRequirements,
	POLICY_ACTION_CATALOG.onboarding.configureWorkflows,
	POLICY_ACTION_CATALOG.calendar.configureDutyTemplates
] satisfies PolicyAction[];

const TRAINING_TYPE_FAMILY = 'training-types' satisfies StarterConfigurationPackArtifactFamilyId;
const ONBOARDING_FAMILY = 'onboarding-template' satisfies StarterConfigurationPackArtifactFamilyId;
const DUTY_ROSTER_FAMILY = 'duty-roster-template' satisfies StarterConfigurationPackArtifactFamilyId;

const STARTER_TRAINING_TYPES = [
	{
		name: 'Unit Orientation',
		description: 'Starter requirement for local orientation and unit-specific expectations.',
		expirationMonths: null,
		color: '#6b7280',
		sortOrder: 0
	},
	{
		name: 'Required Annual Training',
		description: 'Starter requirement for recurring annual training tracked by the organization.',
		expirationMonths: 12,
		color: '#6b7280',
		sortOrder: 1
	}
] as const;

const ONBOARDING_TEMPLATE = {
	name: 'New Arrival Packet',
	description: 'Editable starter checklist for new arrivals.'
} as const;

const ONBOARDING_STEPS = [
	{
		name: 'Confirm contact and roster details',
		description: 'Verify the roster entry has current contact and duty details.',
		stepType: 'checkbox',
		sortOrder: 0
	},
	{
		name: 'Complete unit orientation',
		description: 'Track completion of the starter Unit Orientation training requirement.',
		stepType: 'training',
		trainingTypeName: 'Unit Orientation',
		sortOrder: 1
	},
	{
		name: 'Review required documents',
		description: 'Track document review without assuming a specific packet.',
		stepType: 'paperwork',
		stages: ['issued', 'returned', 'filed'],
		sortOrder: 2
	},
	{
		name: 'Assign duty role and Group',
		description: 'Confirm the person has the right Duty Role and Group assignment.',
		stepType: 'checkbox',
		sortOrder: 3
	}
] as const;

const DUTY_ROSTER_TEMPLATE = {
	name: 'Staff Duty',
	slug: 'staff-duty',
	shortCode: 'SD'
} as const;

const PACK_ARTIFACT_PREVIEW = [
	{
		family: TRAINING_TYPE_FAMILY,
		label: 'Training Types',
		names: STARTER_TRAINING_TYPES.map((type) => type.name),
		description: 'Adds neutral, editable training requirements for orientation and annual training.'
	},
	{
		family: ONBOARDING_FAMILY,
		label: 'Onboarding Template',
		names: [ONBOARDING_TEMPLATE.name, ...ONBOARDING_STEPS.map((step) => step.name)],
		description: 'Adds an editable new-arrival template with ordered first-week steps.'
	},
	{
		family: DUTY_ROSTER_FAMILY,
		label: 'Duty Roster Template',
		names: [DUTY_ROSTER_TEMPLATE.name],
		description: 'Adds a broad-pool Staff Duty scaffold with no exclusions or manual baseline counts.'
	}
] as const;

const trainingTypeUseCases = createCrudUseCases<WritePorts>({
	entity: TrainingTypeEntity,
	auditResource: getEntityAuditResource(TrainingTypeEntity),
	policyAction: TrainingTypeEntity.policyAction!
});

interface StarterPackReadinessRows {
	trainingTypes: Array<Record<string, unknown>>;
	hasAnyTrainingType: boolean;
	onboardingTemplate: Record<string, unknown> | null;
	hasAnyOnboardingTemplate: boolean;
	hasAnyOnboardingTemplateStep: boolean;
	onboardingTemplateSteps: Array<Record<string, unknown>>;
	activeDutyRosterTemplate: Record<string, unknown> | null;
	hasAnyActiveDutyRosterTemplate: boolean;
}

export async function listStarterConfigurationPacks(ctx: UseCaseContext): Promise<StarterConfigurationPackSupport[]> {
	return [await buildFirstWeekOperationsSupport(ctx)];
}

export async function applyStarterConfigurationPack(
	ctx: WritePorts,
	packId: StarterConfigurationPackId | string
): Promise<StarterConfigurationPackApplyResult> {
	if (packId !== PACK_ID) {
		fail(404, 'Starter configuration pack not found');
	}

	await requireStarterPackPreflight(ctx);

	const result = createApplyResult();
	const trainingTypes = await applyStarterTrainingTypes(ctx, result);
	await applyStarterOnboardingTemplate(ctx, result, trainingTypes.get('Unit Orientation')?.id ?? null);
	await applyStarterDutyRosterTemplate(ctx, result);

	return result;
}

async function buildFirstWeekOperationsSupport(ctx: UseCaseContext): Promise<StarterConfigurationPackSupport> {
	const [rows, decisions] = await Promise.all([fetchReadinessRows(ctx), evaluateRequiredConfigureActions(ctx)]);
	const readiness = buildReadiness(rows);
	const deniedActions = decisions
		.filter(({ decision }) => !decision.allowed)
		.map(({ action, decision }) => ({
			id: action.id,
			label: action.label,
			reasonCode: decision.reasonCode
		}));

	return {
		id: PACK_ID,
		name: PACK_NAME,
		description: PACK_DESCRIPTION,
		editableCopy: PACK_EDITABLE_COPY,
		artifacts: PACK_ARTIFACT_PREVIEW.map((artifact) => ({
			family: artifact.family,
			label: artifact.label,
			names: [...artifact.names],
			description: artifact.description
		})),
		readiness,
		canApply: deniedActions.length === 0,
		deniedActions,
		isFullyApplied: readiness.every((family) => family.starterArtifactCount >= family.expectedArtifactCount)
	};
}

async function fetchReadinessRows(ctx: Pick<UseCaseContext, 'store' | 'auth'>): Promise<StarterPackReadinessRows> {
	const starterTrainingNames = STARTER_TRAINING_TYPES.map((type) => type.name);
	const starterStepNames = ONBOARDING_STEPS.map((step) => step.name);
	const [
		trainingTypes,
		anyTrainingTypes,
		starterOnboardingTemplates,
		anyOnboardingTemplates,
		anyOnboardingTemplateSteps,
		activeDutyRosterBySlug,
		activeDutyRosterByName,
		anyActiveDutyRosterTemplates
	] = await Promise.all([
		ctx.store.findMany<Record<string, unknown>>(
			'training_types',
			ctx.auth.orgId,
			{},
			{ inFilters: { name: starterTrainingNames }, select: 'name' }
		),
		ctx.store.findMany<Record<string, unknown>>('training_types', ctx.auth.orgId, {}, { select: 'id', limit: 1 }),
		ctx.store.findMany<Record<string, unknown>>(
			'onboarding_templates',
			ctx.auth.orgId,
			{ name: ONBOARDING_TEMPLATE.name },
			{ select: 'id, name', limit: 1 }
		),
		ctx.store.findMany<Record<string, unknown>>('onboarding_templates', ctx.auth.orgId, {}, { select: 'id', limit: 1 }),
		ctx.store.findMany<Record<string, unknown>>(
			'onboarding_template_steps',
			ctx.auth.orgId,
			{},
			{ select: 'id', limit: 1 }
		),
		ctx.store.findMany<Record<string, unknown>>(
			'duty_roster_templates',
			ctx.auth.orgId,
			{ slug: DUTY_ROSTER_TEMPLATE.slug, status: 'active' },
			{ select: 'id, name, slug, status', limit: 1 }
		),
		ctx.store.findMany<Record<string, unknown>>(
			'duty_roster_templates',
			ctx.auth.orgId,
			{ name: DUTY_ROSTER_TEMPLATE.name, status: 'active' },
			{ select: 'id, name, slug, status', limit: 1 }
		),
		ctx.store.findMany<Record<string, unknown>>(
			'duty_roster_templates',
			ctx.auth.orgId,
			{ status: 'active' },
			{ select: 'id', limit: 1 }
		)
	]);

	const onboardingTemplate = starterOnboardingTemplates[0] ?? null;
	const onboardingTemplateSteps = onboardingTemplate
		? await ctx.store.findMany<Record<string, unknown>>(
				'onboarding_template_steps',
				ctx.auth.orgId,
				{ template_id: stringField(onboardingTemplate, 'id') },
				{ inFilters: { name: starterStepNames }, select: 'name, template_id' }
			)
		: [];

	return {
		trainingTypes,
		hasAnyTrainingType: anyTrainingTypes.length > 0,
		onboardingTemplate,
		hasAnyOnboardingTemplate: anyOnboardingTemplates.length > 0,
		hasAnyOnboardingTemplateStep: anyOnboardingTemplateSteps.length > 0,
		onboardingTemplateSteps,
		activeDutyRosterTemplate: activeDutyRosterBySlug[0] ?? activeDutyRosterByName[0] ?? null,
		hasAnyActiveDutyRosterTemplate: anyActiveDutyRosterTemplates.length > 0
	};
}

function buildReadiness(rows: StarterPackReadinessRows): StarterConfigurationPackSupport['readiness'] {
	const starterTrainingNames = new Set<string>(STARTER_TRAINING_TYPES.map((type) => type.name));
	const existingStarterTrainingNames = rows.trainingTypes
		.map((row) => stringField(row, 'name'))
		.filter((name): name is string => !!name && starterTrainingNames.has(name));

	const starterTemplate = rows.onboardingTemplate;
	const starterStepNames = new Set<string>(ONBOARDING_STEPS.map((step) => step.name));
	const existingStarterStepNames = [
		...new Set(
			rows.onboardingTemplateSteps
				.filter((row) => !!starterTemplate && stringField(row, 'template_id') === stringField(starterTemplate, 'id'))
				.map((row) => stringField(row, 'name'))
				.filter((name): name is string => !!name && starterStepNames.has(name))
		)
	];
	const existingOnboardingNames = [...(starterTemplate ? [ONBOARDING_TEMPLATE.name] : []), ...existingStarterStepNames];

	const starterDutyRoster = rows.activeDutyRosterTemplate;

	return [
		{
			family: TRAINING_TYPE_FAMILY,
			label: 'Training Types',
			configured: rows.hasAnyTrainingType,
			starterArtifactCount: existingStarterTrainingNames.length,
			expectedArtifactCount: STARTER_TRAINING_TYPES.length,
			existingStarterArtifactNames: existingStarterTrainingNames
		},
		{
			family: ONBOARDING_FAMILY,
			label: 'Onboarding Template',
			configured: rows.hasAnyOnboardingTemplate || rows.hasAnyOnboardingTemplateStep,
			starterArtifactCount: existingOnboardingNames.length,
			expectedArtifactCount: 1 + ONBOARDING_STEPS.length,
			existingStarterArtifactNames: existingOnboardingNames
		},
		{
			family: DUTY_ROSTER_FAMILY,
			label: 'Duty Roster Template',
			configured: rows.hasAnyActiveDutyRosterTemplate,
			starterArtifactCount: starterDutyRoster ? 1 : 0,
			expectedArtifactCount: 1,
			existingStarterArtifactNames: starterDutyRoster ? [DUTY_ROSTER_TEMPLATE.name] : []
		}
	];
}

async function evaluateRequiredConfigureActions(ctx: Pick<UseCaseContext, 'auth' | 'readOnlyGuard'>) {
	return Promise.all(
		REQUIRED_CONFIGURE_ACTIONS.map(async (action) => ({
			action,
			decision: await evaluateAuthoritativePolicyDecision(ctx, action, { kind: 'organization' })
		}))
	);
}

async function requireStarterPackPreflight(ctx: WritePorts): Promise<void> {
	for (const action of REQUIRED_CONFIGURE_ACTIONS) {
		await requirePolicyDecision({ auth: ctx.auth, audit: ctx.audit, readOnlyGuard: ctx.readOnlyGuard }, action, {
			kind: 'organization'
		});
	}
}

async function applyStarterTrainingTypes(
	ctx: WritePorts,
	result: StarterConfigurationPackApplyResult
): Promise<Map<string, TrainingType>> {
	const trainingTypes = new Map<string, TrainingType>();

	for (const starterType of STARTER_TRAINING_TYPES) {
		const existing = await findTrainingTypeByName(ctx, starterType.name);
		if (existing) {
			trainingTypes.set(starterType.name, TrainingTypeEntity.fromDb(existing));
			recordSkipped(result, TRAINING_TYPE_FAMILY, starterType.name);
			continue;
		}

		try {
			const created = (await trainingTypeUseCases.create(ctx, {
				name: starterType.name,
				description: starterType.description,
				expirationMonths: starterType.expirationMonths,
				color: starterType.color,
				sortOrder: starterType.sortOrder
			})) as TrainingType;
			trainingTypes.set(starterType.name, created);
			recordCreated(result, TRAINING_TYPE_FAMILY, starterType.name);
		} catch (error) {
			rethrowAuthorizationFailure(error);
			if (isUniqueConflict(error)) {
				const racedExisting = await findTrainingTypeByName(ctx, starterType.name);
				if (racedExisting) {
					trainingTypes.set(starterType.name, TrainingTypeEntity.fromDb(racedExisting));
					recordSkipped(result, TRAINING_TYPE_FAMILY, starterType.name);
					continue;
				}
			}
			recordFailed(result, TRAINING_TYPE_FAMILY, starterType.name);
		}
	}

	return trainingTypes;
}

async function applyStarterOnboardingTemplate(
	ctx: WritePorts,
	result: StarterConfigurationPackApplyResult,
	unitOrientationTrainingTypeId: string | null
): Promise<void> {
	let template = await findOnboardingTemplateByName(ctx, ONBOARDING_TEMPLATE.name);

	if (template) {
		recordSkipped(result, ONBOARDING_FAMILY, ONBOARDING_TEMPLATE.name);
	} else {
		try {
			template = await createOnboardingTemplate(ctx, {
				name: ONBOARDING_TEMPLATE.name,
				description: ONBOARDING_TEMPLATE.description
			});
			recordCreated(result, ONBOARDING_FAMILY, ONBOARDING_TEMPLATE.name);
		} catch (error) {
			rethrowAuthorizationFailure(error);
			if (isUniqueConflict(error)) {
				template = await findOnboardingTemplateByName(ctx, ONBOARDING_TEMPLATE.name);
				if (template) {
					recordSkipped(result, ONBOARDING_FAMILY, ONBOARDING_TEMPLATE.name);
				} else {
					recordFailed(result, ONBOARDING_FAMILY, ONBOARDING_TEMPLATE.name);
					return;
				}
			} else {
				recordFailed(result, ONBOARDING_FAMILY, ONBOARDING_TEMPLATE.name);
				return;
			}
		}
	}

	const existingSteps = await ctx.store.findMany<Record<string, unknown>>('onboarding_template_steps', ctx.auth.orgId, {
		template_id: template.id
	});
	const existingStepNames = new Set(existingSteps.map((row) => stringField(row, 'name')).filter(Boolean));

	for (const starterStep of ONBOARDING_STEPS) {
		if (existingStepNames.has(starterStep.name)) {
			recordSkipped(result, ONBOARDING_FAMILY, starterStep.name);
			continue;
		}

		const trainingTypeId = starterStep.stepType === 'training' ? unitOrientationTrainingTypeId : null;
		if (starterStep.stepType === 'training' && !trainingTypeId) {
			recordFailed(result, ONBOARDING_FAMILY, starterStep.name);
			continue;
		}

		try {
			await createStarterOnboardingTemplateStep(ctx, template.id, starterStep, trainingTypeId);
			existingStepNames.add(starterStep.name);
			recordCreated(result, ONBOARDING_FAMILY, starterStep.name);
		} catch (error) {
			rethrowAuthorizationFailure(error);
			if (isUniqueConflict(error)) {
				const racedExisting = await findOnboardingTemplateStepByName(ctx, template.id, starterStep.name);
				if (racedExisting) {
					existingStepNames.add(starterStep.name);
					recordSkipped(result, ONBOARDING_FAMILY, starterStep.name);
					continue;
				}
			}
			recordFailed(result, ONBOARDING_FAMILY, starterStep.name);
		}
	}
}

async function applyStarterDutyRosterTemplate(ctx: WritePorts, result: StarterConfigurationPackApplyResult) {
	const existing = await findActiveStarterDutyRosterTemplate(ctx);

	if (existing) {
		recordSkipped(result, DUTY_ROSTER_FAMILY, DUTY_ROSTER_TEMPLATE.name);
		return;
	}

	try {
		const created = await createStarterDutyRosterTemplate(ctx);
		if (!created) {
			recordSkipped(result, DUTY_ROSTER_FAMILY, DUTY_ROSTER_TEMPLATE.name);
			return;
		}

		recordCreated(result, DUTY_ROSTER_FAMILY, DUTY_ROSTER_TEMPLATE.name);
	} catch (error) {
		rethrowAuthorizationFailure(error);
		if (isDutyRosterSlugConflict(error)) {
			const racedExisting = await findActiveStarterDutyRosterTemplate(ctx);
			if (racedExisting) {
				recordSkipped(result, DUTY_ROSTER_FAMILY, DUTY_ROSTER_TEMPLATE.name);
				return;
			}
		}
		recordFailed(result, DUTY_ROSTER_FAMILY, DUTY_ROSTER_TEMPLATE.name);
	}
}

async function createStarterDutyRosterTemplate(ctx: WritePorts): Promise<DutyRosterTemplate | null> {
	const activeExisting = await findActiveStarterDutyRosterTemplate(ctx);
	if (activeExisting) {
		return null;
	}
	const slug = await nextAvailableStarterDutyRosterSlug(ctx);

	return createConfiguredDutyRosterTemplate(ctx, {
		name: DUTY_ROSTER_TEMPLATE.name,
		slug,
		shortCode: DUTY_ROSTER_TEMPLATE.shortCode,
		poolCriteria: EMPTY_DUTY_ROSTER_POOL_CRITERIA,
		exemptPersonnelIds: [],
		manualBaselineCounts: {}
	});
}

async function createStarterOnboardingTemplateStep(
	ctx: WritePorts,
	templateId: string,
	starterStep: (typeof ONBOARDING_STEPS)[number],
	trainingTypeId: string | null
): Promise<void> {
	const stepId = deterministicStarterOnboardingStepId(templateId, starterStep.name);
	const row = await ctx.store.insert<Record<string, unknown>>('onboarding_template_steps', ctx.auth.orgId, {
		id: stepId,
		template_id: templateId,
		name: starterStep.name,
		description: starterStep.description,
		step_type: starterStep.stepType,
		training_type_id: trainingTypeId,
		stages: starterStep.stepType === 'paperwork' ? starterStep.stages : null,
		sort_order: starterStep.sortOrder
	});

	ctx.audit.log({
		action: 'onboarding_template_step.created',
		resourceType: 'onboarding_template_step',
		resourceId: stringField(row, 'id') ?? stepId
	});
}

function deterministicStarterOnboardingStepId(templateId: string, stepName: string): string {
	const hex = createHash('sha256')
		.update(`trooptotask:starter-onboarding-step:${templateId}:${stepName}`)
		.digest('hex')
		.slice(0, 32)
		.split('');
	hex[12] = '5';
	hex[16] = ((Number.parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
	const value = hex.join('');
	return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

async function findTrainingTypeByName(ctx: Pick<WritePorts, 'store' | 'auth'>, name: string) {
	return ctx.store.findOne<Record<string, unknown>>('training_types', ctx.auth.orgId, { name });
}

async function findOnboardingTemplateByName(
	ctx: Pick<WritePorts, 'store' | 'auth'>,
	name: string
): Promise<OnboardingTemplate | null> {
	const row = await ctx.store.findOne<Record<string, unknown>>('onboarding_templates', ctx.auth.orgId, { name });
	return row ? ({ ...row, orgId: ctx.auth.orgId } as unknown as OnboardingTemplate) : null;
}

async function nextAvailableStarterDutyRosterSlug(ctx: Pick<WritePorts, 'store' | 'auth'>): Promise<string> {
	const rows = await ctx.store.findMany<Record<string, unknown>>(
		'duty_roster_templates',
		ctx.auth.orgId,
		{},
		{ select: 'slug' }
	);
	return buildUniqueDutyRosterTemplateSlug({
		name: DUTY_ROSTER_TEMPLATE.name,
		existingSlugs: rows.map((row) => stringField(row, 'slug')).filter((slug): slug is string => !!slug)
	});
}

async function findOnboardingTemplateStepByName(
	ctx: Pick<WritePorts, 'store' | 'auth'>,
	templateId: string,
	name: string
): Promise<Record<string, unknown> | null> {
	return ctx.store.findOne<Record<string, unknown>>('onboarding_template_steps', ctx.auth.orgId, {
		template_id: templateId,
		name
	});
}

async function findActiveStarterDutyRosterTemplate(
	ctx: Pick<WritePorts, 'store' | 'auth'>
): Promise<Record<string, unknown> | null> {
	const [bySlug, byName] = await Promise.all([
		ctx.store.findMany<Record<string, unknown>>(
			'duty_roster_templates',
			ctx.auth.orgId,
			{ slug: DUTY_ROSTER_TEMPLATE.slug, status: 'active' },
			{ select: 'id, name, slug, status', limit: 1 }
		),
		ctx.store.findMany<Record<string, unknown>>(
			'duty_roster_templates',
			ctx.auth.orgId,
			{ name: DUTY_ROSTER_TEMPLATE.name, status: 'active' },
			{ select: 'id, name, slug, status', limit: 1 }
		)
	]);
	return bySlug[0] ?? byName[0] ?? null;
}

function createApplyResult(): StarterConfigurationPackApplyResult {
	return {
		packId: PACK_ID,
		packName: PACK_NAME,
		created: [],
		skipped: [],
		failed: []
	};
}

function recordCreated(
	result: StarterConfigurationPackApplyResult,
	family: StarterConfigurationPackArtifactFamilyId,
	name: string
): void {
	result.created.push(resultItem(family, name));
}

function recordSkipped(
	result: StarterConfigurationPackApplyResult,
	family: StarterConfigurationPackArtifactFamilyId,
	name: string
): void {
	result.skipped.push(resultItem(family, name));
}

function recordFailed(
	result: StarterConfigurationPackApplyResult,
	family: StarterConfigurationPackArtifactFamilyId,
	name: string
): void {
	result.failed.push({ ...resultItem(family, name), message: SUPPORT_SAFE_FAILURE });
}

function resultItem(
	family: StarterConfigurationPackArtifactFamilyId,
	name: string
): StarterConfigurationPackResultItem {
	return { family, name };
}

function rethrowAuthorizationFailure(error: unknown): void {
	if (
		error &&
		typeof error === 'object' &&
		'status' in error &&
		((error as { status?: unknown }).status === 401 || (error as { status?: unknown }).status === 403)
	) {
		throw error;
	}
}

function isUniqueConflict(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const candidate = error as { code?: unknown; message?: unknown; details?: unknown; constraint?: unknown };
	const haystack = [candidate.code, candidate.message, candidate.details, candidate.constraint]
		.filter((value): value is string => typeof value === 'string')
		.join(' ')
		.toLowerCase();
	return haystack.includes('23505') || haystack.includes('duplicate') || haystack.includes('unique');
}

function isDutyRosterSlugConflict(error: unknown): boolean {
	const message = error instanceof Error ? error.message.toLowerCase() : '';
	return (
		(isUniqueConflict(error) && (!message || message.includes('slug'))) ||
		message.includes('duty roster template slug is already in use')
	);
}

function stringField(row: Record<string, unknown> | null | undefined, field: string): string | null {
	const value = row?.[field];
	return typeof value === 'string' ? value : null;
}
