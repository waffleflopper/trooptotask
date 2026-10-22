import { POLICY_ACTION_CATALOG, type PolicyAction } from '$lib/access/policyEvaluator';
import { requirePolicyDecision } from '$lib/access/index.server';
import { fail } from '$lib/errors';
import type { OnboardingTemplateWriteContext } from '$features/onboarding/index.server';
import { createOnboardingTemplate, createStarterOnboardingTemplateStep } from '$features/onboarding/index.server';
import { createTrainingType } from '$features/training/index.server';
import type {
	TrainingOnboardingReferencesPort,
	TrainingTypeLabel,
	TrainingCatalogPersistence
} from '$features/training/contracts';
import type {
	StarterConfigurationPackApplyResult,
	StarterConfigurationPackArtifactFamilyId,
	StarterConfigurationPackId,
	StarterConfigurationPackResultItem
} from '$features/dashboard/contracts';

const PACK_ID: StarterConfigurationPackId = 'first-week-operations';
const PACK_NAME = 'First Week Operations';
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

type StarterConfigurationApplyContext = OnboardingTemplateWriteContext & {
	readonly trainingCatalog: Pick<TrainingCatalogPersistence, 'findTypeByName' | 'createType'>;
	readonly trainingOnboardingReferences: Pick<TrainingOnboardingReferencesPort, 'listTypes'>;
};

export async function applyStarterConfigurationPack(
	ctx: StarterConfigurationApplyContext,
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

async function requireStarterPackPreflight(ctx: Pick<OnboardingTemplateWriteContext, 'auth' | 'audit'>): Promise<void> {
	for (const action of REQUIRED_CONFIGURE_ACTIONS) {
		await requirePolicyDecision({ auth: ctx.auth, audit: ctx.audit }, action, {
			kind: 'organization'
		});
	}
}

async function applyStarterTrainingTypes(
	ctx: StarterConfigurationApplyContext,
	result: StarterConfigurationPackApplyResult
): Promise<Map<string, TrainingTypeLabel>> {
	const trainingTypes = new Map<string, TrainingTypeLabel>();

	for (const starterType of STARTER_TRAINING_TYPES) {
		const existing = await ctx.trainingCatalog.findTypeByName(starterType.name);
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
				const racedExisting = await ctx.trainingCatalog.findTypeByName(starterType.name);
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
	ctx: StarterConfigurationApplyContext,
	result: StarterConfigurationPackApplyResult,
	unitOrientationTrainingTypeId: string | null
): Promise<void> {
	let template = await ctx.onboardingCatalog.findTemplateByName(ONBOARDING_TEMPLATE.name);

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
				template = await ctx.onboardingCatalog.findTemplateByName(ONBOARDING_TEMPLATE.name);
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

	const existingSteps = await ctx.onboardingCatalog.listSteps(template.id);
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
				const racedExisting = await ctx.onboardingCatalog.findStepByTemplateAndName(template.id, starterStep.name);
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
