import { POLICY_ACTION_CATALOG, type PolicyAction } from '$lib/access/policyEvaluator';
import { evaluateAuthoritativePolicyDecision } from '$lib/access/index.server';
import { requirePolicyDecision } from '$lib/access/index.server';
import { fail } from '$lib/errors';
import type { WritePorts } from '$lib/server/core/ports';
import {
	createOnboardingTemplate,
	createStarterOnboardingTemplateStep,
	findOnboardingTemplateByName,
	findOnboardingTemplateStepByName,
	listOnboardingTemplateSteps,
	fetchOnboardingStarterReadiness
} from '$features/onboarding/index.server';
import {
	createTrainingType,
	findTrainingTypeByName,
	hasTrainingTypes,
	listExistingTrainingTypeNames
} from '$features/training/index.server';
import type { OnboardingTemplate } from '$features/onboarding/contracts';
import type { TrainingType } from '$features/training/contracts';
import type {
	StarterConfigurationPackApplyResult,
	StarterConfigurationPackArtifactFamilyId,
	StarterConfigurationPackId,
	StarterConfigurationPackResultItem,
	StarterConfigurationPackSupport
} from '$features/dashboard/contracts';

const PACK_ID: StarterConfigurationPackId = 'first-week-operations';
const PACK_NAME = 'First Week Operations';
const PACK_DESCRIPTION =
	'Optional starter configuration for common first-week setup. Owners can edit or remove every artifact after applying it.';
const PACK_EDITABLE_COPY = 'Creates editable Training Types and onboarding steps.';
const SUPPORT_SAFE_FAILURE = 'This starter artifact could not be created. Existing configuration was left unchanged.';

const REQUIRED_CONFIGURE_ACTIONS = [
	POLICY_ACTION_CATALOG.training.configureRequirements,
	POLICY_ACTION_CATALOG.onboarding.configureWorkflows
] satisfies PolicyAction[];

const TRAINING_TYPE_FAMILY = 'training-types' satisfies StarterConfigurationPackArtifactFamilyId;
const ONBOARDING_FAMILY = 'onboarding-template' satisfies StarterConfigurationPackArtifactFamilyId;

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
	}
] as const;

interface StarterPackReadinessRows {
	trainingTypeNames: string[];
	hasAnyTrainingType: boolean;
	onboardingTemplate: OnboardingTemplate | null;
	hasAnyOnboardingTemplate: boolean;
	hasAnyOnboardingTemplateStep: boolean;
	onboardingStepNames: string[];
}

export async function listStarterConfigurationPacks(
	ctx: Pick<WritePorts, 'store' | 'auth'>
): Promise<StarterConfigurationPackSupport[]> {
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

	return result;
}

async function buildFirstWeekOperationsSupport(
	ctx: Pick<WritePorts, 'store' | 'auth'>
): Promise<StarterConfigurationPackSupport> {
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

async function fetchReadinessRows(ctx: Pick<WritePorts, 'store' | 'auth'>): Promise<StarterPackReadinessRows> {
	const starterTrainingNames = STARTER_TRAINING_TYPES.map((type) => type.name);
	const starterStepNames = ONBOARDING_STEPS.map((step) => step.name);
	const [trainingTypeNames, hasAnyTrainingType, onboarding] = await Promise.all([
		listExistingTrainingTypeNames(ctx.store, ctx.auth.orgId, starterTrainingNames),
		hasTrainingTypes(ctx.store, ctx.auth.orgId),
		fetchOnboardingStarterReadiness(ctx.store, ctx.auth.orgId, ONBOARDING_TEMPLATE.name, starterStepNames)
	]);
	return {
		trainingTypeNames,
		hasAnyTrainingType,
		onboardingTemplate: onboarding.template,
		hasAnyOnboardingTemplate: onboarding.hasAnyTemplate,
		hasAnyOnboardingTemplateStep: onboarding.hasAnyStep,
		onboardingStepNames: onboarding.stepNames
	};
}

function buildReadiness(rows: StarterPackReadinessRows): StarterConfigurationPackSupport['readiness'] {
	const starterTrainingNames = new Set<string>(STARTER_TRAINING_TYPES.map((type) => type.name));
	const existingStarterTrainingNames = rows.trainingTypeNames.filter((name) => starterTrainingNames.has(name));

	const starterTemplate = rows.onboardingTemplate;
	const starterStepNames = new Set<string>(ONBOARDING_STEPS.map((step) => step.name));
	const existingStarterStepNames = [
		...new Set(rows.onboardingStepNames.filter((name) => !!starterTemplate && starterStepNames.has(name)))
	];
	const existingOnboardingNames = [...(starterTemplate ? [ONBOARDING_TEMPLATE.name] : []), ...existingStarterStepNames];

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
		}
	];
}

async function evaluateRequiredConfigureActions(ctx: Pick<WritePorts, 'auth'>) {
	return Promise.all(
		REQUIRED_CONFIGURE_ACTIONS.map(async (action) => ({
			action,
			decision: await evaluateAuthoritativePolicyDecision(ctx, action, { kind: 'organization' })
		}))
	);
}

async function requireStarterPackPreflight(ctx: WritePorts): Promise<void> {
	for (const action of REQUIRED_CONFIGURE_ACTIONS) {
		await requirePolicyDecision({ auth: ctx.auth, audit: ctx.audit }, action, {
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
		const existing = await findTrainingTypeByName(ctx.store, ctx.auth.orgId, starterType.name);
		if (existing) {
			trainingTypes.set(starterType.name, existing);
			recordSkipped(result, TRAINING_TYPE_FAMILY, starterType.name);
			continue;
		}

		try {
			const created = await createTrainingType(ctx, {
				name: starterType.name,
				description: starterType.description,
				expirationMonths: starterType.expirationMonths,
				color: starterType.color,
				sortOrder: starterType.sortOrder
			});
			trainingTypes.set(starterType.name, created);
			recordCreated(result, TRAINING_TYPE_FAMILY, starterType.name);
		} catch (error) {
			rethrowAuthorizationFailure(error);
			if (isUniqueConflict(error)) {
				const racedExisting = await findTrainingTypeByName(ctx.store, ctx.auth.orgId, starterType.name);
				if (racedExisting) {
					trainingTypes.set(starterType.name, racedExisting);
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
	let template = await findOnboardingTemplateByName(ctx.store, ctx.auth.orgId, ONBOARDING_TEMPLATE.name);

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
				template = await findOnboardingTemplateByName(ctx.store, ctx.auth.orgId, ONBOARDING_TEMPLATE.name);
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

	const existingSteps = await listOnboardingTemplateSteps(ctx.store, ctx.auth.orgId, template.id);
	const existingStepNames = new Set(existingSteps.map((step) => step.name));

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
			await createStarterOnboardingTemplateStep(ctx, {
				templateId: template.id,
				name: starterStep.name,
				description: starterStep.description,
				stepType: starterStep.stepType,
				trainingTypeId,
				stages: starterStep.stepType === 'paperwork' ? starterStep.stages : null,
				sortOrder: starterStep.sortOrder
			});
			existingStepNames.add(starterStep.name);
			recordCreated(result, ONBOARDING_FAMILY, starterStep.name);
		} catch (error) {
			rethrowAuthorizationFailure(error);
			if (isUniqueConflict(error)) {
				const racedExisting = await findOnboardingTemplateStepByName(
					ctx.store,
					ctx.auth.orgId,
					template.id,
					starterStep.name
				);
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
