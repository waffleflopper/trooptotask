import { fail } from '$lib/server/core/errors';
import type { WritePorts } from '$lib/server/core/ports';
import { OnboardingTemplateEntity } from '$lib/server/entities/onboardingTemplate';
import { OnboardingTemplateStepEntity } from '$lib/server/entities/onboardingTemplateStep';
import { getEntityAuditResource } from '$lib/server/entitySchema';
import type {
	OnboardingTemplate,
	OnboardingTemplateStep,
	OnboardingStepType
} from '$features/onboarding/onboarding.types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireFeaturePolicy } from './featurePolicy';
import { createCrudUseCases } from './crud';

const TEMPLATE_CLEAR_BATCH_SIZE = 25;

type TemplateCreateInput = Record<string, unknown>;
type TemplateUpdateInput = Record<string, unknown> & { id?: unknown };
type StepCreateInput = Record<string, unknown>;
type StepUpdateInput = Record<string, unknown> & { id?: unknown };

export interface ReorderOnboardingTemplateStepsInput {
	templateId: string;
	orderedStepIds: string[];
}

const templateUseCases = createCrudUseCases({
	entity: OnboardingTemplateEntity,
	auditResource: getEntityAuditResource(OnboardingTemplateEntity),
	policyAction: OnboardingTemplateEntity.policyAction!,
	afterDelete: deleteTemplateDependents
});

const stepUseCases = createCrudUseCases({
	entity: OnboardingTemplateStepEntity,
	auditResource: getEntityAuditResource(OnboardingTemplateStepEntity),
	policyAction: OnboardingTemplateStepEntity.policyAction!
});

export async function createOnboardingTemplate(
	ctx: WritePorts,
	input: TemplateCreateInput
): Promise<OnboardingTemplate> {
	return (await templateUseCases.create(ctx, normalizeTemplateInput(input))) as OnboardingTemplate;
}

export async function updateOnboardingTemplate(
	ctx: WritePorts,
	input: TemplateUpdateInput
): Promise<OnboardingTemplate> {
	return (await templateUseCases.update(ctx, normalizeTemplateInput(input))) as OnboardingTemplate;
}

export async function deleteOnboardingTemplate(ctx: WritePorts, templateId: string): Promise<void> {
	await templateUseCases.remove(ctx, templateId);
}

export async function createOnboardingTemplateStep(
	ctx: WritePorts,
	input: StepCreateInput
): Promise<OnboardingTemplateStep> {
	return (await stepUseCases.create(ctx, normalizeStepInput(input))) as OnboardingTemplateStep;
}

export async function updateOnboardingTemplateStep(
	ctx: WritePorts,
	input: StepUpdateInput
): Promise<OnboardingTemplateStep> {
	return (await stepUseCases.update(ctx, normalizeStepInput(input))) as OnboardingTemplateStep;
}

export async function deleteOnboardingTemplateStep(ctx: WritePorts, stepId: string): Promise<void> {
	await stepUseCases.remove(ctx, stepId);
}

export async function reorderOnboardingTemplateSteps(
	ctx: WritePorts,
	input: ReorderOnboardingTemplateStepsInput
): Promise<OnboardingTemplateStep[]> {
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.onboarding.configureWorkflows,
		{ kind: 'organization' },
		'onboarding_template_step'
	);

	const currentRows = await ctx.store.findMany<Record<string, unknown>>(
		OnboardingTemplateStepEntity.table,
		ctx.auth.orgId,
		{ template_id: input.templateId },
		{ orderBy: [{ column: 'sort_order', ascending: true }] }
	);
	const currentSteps = OnboardingTemplateStepEntity.fromDbArray(currentRows);
	const currentIds = new Set(currentSteps.map((step) => step.id));

	if (input.orderedStepIds.length !== currentIds.size || input.orderedStepIds.some((id) => !currentIds.has(id))) {
		fail(409, 'Step order does not match the selected onboarding template');
	}

	const updatedRows: Record<string, unknown>[] = [];
	for (const [sortOrder, stepId] of input.orderedStepIds.entries()) {
		const row = await ctx.store.update<Record<string, unknown>>(
			OnboardingTemplateStepEntity.table,
			ctx.auth.orgId,
			stepId,
			{ sort_order: sortOrder }
		);
		updatedRows.push(row);
	}

	ctx.audit.log({
		action: 'onboarding_template_step.reordered',
		resourceType: 'onboarding_template_step',
		resourceId: input.templateId,
		details: { templateId: input.templateId, stepCount: input.orderedStepIds.length }
	});

	return OnboardingTemplateStepEntity.fromDbArray(updatedRows).sort((a, b) => a.sortOrder - b.sortOrder);
}

async function deleteTemplateDependents(ctx: WritePorts, templateId: string): Promise<void> {
	await ctx.store.deleteWhere(OnboardingTemplateStepEntity.table, ctx.auth.orgId, { template_id: templateId });

	const onboardings = await ctx.store.findMany<{ id: string }>('personnel_onboardings', ctx.auth.orgId, {
		template_id: templateId
	});

	for (let index = 0; index < onboardings.length; index += TEMPLATE_CLEAR_BATCH_SIZE) {
		const batch = onboardings.slice(index, index + TEMPLATE_CLEAR_BATCH_SIZE);
		await Promise.all(
			batch.map((onboarding) =>
				ctx.store.update('personnel_onboardings', ctx.auth.orgId, onboarding.id, { template_id: null })
			)
		);
	}
}

function normalizeTemplateInput<T extends TemplateCreateInput | TemplateUpdateInput>(input: T): T {
	const output: Record<string, unknown> = { ...input };
	if (typeof input.id !== 'string' || input.name !== undefined) {
		output.name = normalizeRequiredString(input.name, 'Template name is required');
	}
	if (input.description !== undefined) {
		output.description = normalizeNullableString(input.description);
	}
	return output as T;
}

function normalizeStepInput<T extends StepCreateInput | StepUpdateInput>(input: T): T {
	const stepType = input.stepType as OnboardingStepType | undefined;
	const output: Record<string, unknown> = { ...input };

	if (typeof input.id !== 'string' || input.name !== undefined) {
		output.name = normalizeRequiredString(input.name, 'Step name is required');
	}
	if (input.description !== undefined) {
		output.description = normalizeNullableString(input.description);
	}

	if (!stepType) {
		return output as T;
	}

	if (stepType === 'training') {
		const trainingTypeId = normalizeNullableString(input.trainingTypeId);
		if (!trainingTypeId) {
			fail(400, 'Training steps require a Training Type');
		}
		return {
			...output,
			trainingTypeId,
			stages: null
		} as unknown as T;
	}

	if (stepType === 'paperwork') {
		return {
			...output,
			trainingTypeId: null,
			stages: normalizeStages(input.stages)
		} as unknown as T;
	}

	return {
		...output,
		trainingTypeId: null,
		stages: null
	} as unknown as T;
}

function normalizeRequiredString(value: unknown, message: string): string {
	if (typeof value !== 'string') {
		fail(400, message);
	}
	const trimmed = value.trim();
	if (!trimmed) {
		fail(400, message);
	}
	return trimmed;
}

function normalizeNullableString(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}
	const trimmed = value.trim();
	return trimmed || null;
}

function normalizeStages(value: unknown): string[] | null {
	if (!Array.isArray(value)) {
		return null;
	}
	const stages = value
		.filter((stage): stage is string => typeof stage === 'string')
		.map((stage) => stage.trim())
		.filter(Boolean);
	return stages.length > 0 ? stages : null;
}
