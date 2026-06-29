import { POLICY_ACTION_CATALOG, type PolicyAction } from '$lib/access/policyEvaluator';
import { evaluateAuthoritativePolicyDecision } from '$lib/server/core/useCases/policyAdapter';
import { requirePolicyDecision } from '$lib/server/core/useCases/policyAuthorization';
import { fail } from '$lib/server/core/errors';
import type { UseCaseContext, WritePorts } from '$lib/server/core/ports';
import { createCrudUseCases } from '$lib/server/core/useCases/crud';
import { createOnboardingTemplate, createOnboardingTemplateStep } from './onboardingTemplateCrud';
import { createConfiguredDutyRosterTemplate } from './dutyRosterTemplates';
import { getEntityAuditResource } from '$lib/server/entitySchema';
import { TrainingTypeEntity } from '$lib/server/entities/trainingType';
import { EMPTY_DUTY_ROSTER_POOL_CRITERIA } from '$features/duty-roster/templates/dutyRosterTemplates';
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
	onboardingTemplates: Array<Record<string, unknown>>;
	onboardingTemplateSteps: Array<Record<string, unknown>>;
	dutyRosterTemplates: Array<Record<string, unknown>>;
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
	const [trainingTypes, onboardingTemplates, onboardingTemplateSteps, dutyRosterTemplates] = await Promise.all([
		ctx.store.findMany<Record<string, unknown>>('training_types', ctx.auth.orgId),
		ctx.store.findMany<Record<string, unknown>>('onboarding_templates', ctx.auth.orgId),
		ctx.store.findMany<Record<string, unknown>>('onboarding_template_steps', ctx.auth.orgId),
		ctx.store.findMany<Record<string, unknown>>('duty_roster_templates', ctx.auth.orgId)
	]);

	return { trainingTypes, onboardingTemplates, onboardingTemplateSteps, dutyRosterTemplates };
}

function buildReadiness(rows: StarterPackReadinessRows): StarterConfigurationPackSupport['readiness'] {
	const starterTrainingNames = new Set<string>(STARTER_TRAINING_TYPES.map((type) => type.name));
	const existingStarterTrainingNames = rows.trainingTypes
		.map((row) => stringField(row, 'name'))
		.filter((name): name is string => !!name && starterTrainingNames.has(name));

	const starterTemplate = rows.onboardingTemplates.find((row) => stringField(row, 'name') === ONBOARDING_TEMPLATE.name);
	const starterStepNames = new Set<string>(ONBOARDING_STEPS.map((step) => step.name));
	const existingStarterStepNames = rows.onboardingTemplateSteps
		.filter((row) => !!starterTemplate && stringField(row, 'template_id') === stringField(starterTemplate, 'id'))
		.map((row) => stringField(row, 'name'))
		.filter((name): name is string => !!name && starterStepNames.has(name));
	const existingOnboardingNames = [...(starterTemplate ? [ONBOARDING_TEMPLATE.name] : []), ...existingStarterStepNames];

	const starterDutyRoster = rows.dutyRosterTemplates.find(
		(row) => stringField(row, 'slug') === DUTY_ROSTER_TEMPLATE.slug
	);

	return [
		{
			family: TRAINING_TYPE_FAMILY,
			label: 'Training Types',
			configured: rows.trainingTypes.length > 0,
			starterArtifactCount: existingStarterTrainingNames.length,
			expectedArtifactCount: STARTER_TRAINING_TYPES.length,
			existingStarterArtifactNames: existingStarterTrainingNames
		},
		{
			family: ONBOARDING_FAMILY,
			label: 'Onboarding Template',
			configured: rows.onboardingTemplates.length > 0 || rows.onboardingTemplateSteps.length > 0,
			starterArtifactCount: existingOnboardingNames.length,
			expectedArtifactCount: 1 + ONBOARDING_STEPS.length,
			existingStarterArtifactNames: existingOnboardingNames
		},
		{
			family: DUTY_ROSTER_FAMILY,
			label: 'Duty Roster Template',
			configured: rows.dutyRosterTemplates.length > 0,
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
			await createOnboardingTemplateStep(ctx, {
				templateId: template.id,
				name: starterStep.name,
				description: starterStep.description,
				stepType: starterStep.stepType,
				trainingTypeId,
				stages: starterStep.stepType === 'paperwork' ? starterStep.stages : null,
				sortOrder: starterStep.sortOrder
			});
			recordCreated(result, ONBOARDING_FAMILY, starterStep.name);
		} catch (error) {
			rethrowAuthorizationFailure(error);
			recordFailed(result, ONBOARDING_FAMILY, starterStep.name);
		}
	}
}

async function applyStarterDutyRosterTemplate(ctx: WritePorts, result: StarterConfigurationPackApplyResult) {
	const existing = await ctx.store.findOne<Record<string, unknown>>('duty_roster_templates', ctx.auth.orgId, {
		slug: DUTY_ROSTER_TEMPLATE.slug
	});

	if (existing) {
		recordSkipped(result, DUTY_ROSTER_FAMILY, DUTY_ROSTER_TEMPLATE.name);
		return;
	}

	try {
		await createConfiguredDutyRosterTemplate(ctx, {
			name: DUTY_ROSTER_TEMPLATE.name,
			slug: DUTY_ROSTER_TEMPLATE.slug,
			shortCode: DUTY_ROSTER_TEMPLATE.shortCode,
			poolCriteria: EMPTY_DUTY_ROSTER_POOL_CRITERIA,
			exemptPersonnelIds: [],
			manualBaselineCounts: {}
		});
		recordCreated(result, DUTY_ROSTER_FAMILY, DUTY_ROSTER_TEMPLATE.name);
	} catch (error) {
		rethrowAuthorizationFailure(error);
		if (isDutyRosterSlugConflict(error)) {
			const racedExisting = await findDutyRosterTemplateBySlug(ctx, DUTY_ROSTER_TEMPLATE.slug);
			if (racedExisting) {
				recordSkipped(result, DUTY_ROSTER_FAMILY, DUTY_ROSTER_TEMPLATE.name);
				return;
			}
		}
		recordFailed(result, DUTY_ROSTER_FAMILY, DUTY_ROSTER_TEMPLATE.name);
	}
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

async function findDutyRosterTemplateBySlug(
	ctx: Pick<WritePorts, 'store' | 'auth'>,
	slug: string
): Promise<Record<string, unknown> | null> {
	return ctx.store.findOne<Record<string, unknown>>('duty_roster_templates', ctx.auth.orgId, { slug });
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
