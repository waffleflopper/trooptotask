import { createHash } from 'node:crypto';
import { z } from 'zod';
import { error } from '@sveltejs/kit';
import type {
	OnboardingTemplate,
	OnboardingTemplateStep,
	OnboardingTemplateStepData,
	OnboardingTemplateData
} from '../contracts';
import type { OnboardingTemplateWriteContext } from './onboardingTemplatePorts.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireFeaturePolicy } from '$lib/access/index.server';

const templateCreateSchema = z.object({ name: z.string(), description: z.string().nullable().optional() });
const templateUpdateSchema = templateCreateSchema.partial().extend({ id: z.string() });
const stepCreateSchema = z.object({
	templateId: z.string(),
	name: z.string(),
	description: z.string().nullable().optional(),
	stepType: z.enum(['training', 'paperwork', 'checkbox']),
	trainingTypeId: z.string().nullable().optional(),
	stages: z.array(z.string()).nullable().optional(),
	sortOrder: z.number().int().optional()
});
const stepUpdateSchema = stepCreateSchema.omit({ sortOrder: true }).partial().extend({ id: z.string() });

const configureAction = POLICY_ACTION_CATALOG.onboarding.configureWorkflows;
const catalogResource = { kind: 'organization' } as const;
type TemplateCreateInput = Record<string, unknown>;
type TemplateUpdateInput = Record<string, unknown> & { id?: unknown };
type StepCreateInput = Record<string, unknown>;
type StepUpdateInput = Record<string, unknown> & { id?: unknown };

export interface ReorderOnboardingTemplateStepsInput {
	templateId: string;
	orderedStepIds: string[];
}

export interface DuplicateOnboardingTemplateInput {
	templateId: string;
	requestId: string;
}

export interface DuplicateOnboardingTemplateResult {
	template: OnboardingTemplate;
	templateSteps: OnboardingTemplateStep[];
}

function parseInput<T>(schema: z.ZodType<T>, input: Record<string, unknown>): T {
	const parsed = schema.safeParse(input);
	if (!parsed.success) throw error(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	return parsed.data;
}

export async function createOnboardingTemplate(
	ctx: OnboardingTemplateWriteContext,
	input: TemplateCreateInput
): Promise<OnboardingTemplate> {
	const parsed = normalizeTemplateInput(parseInput(templateCreateSchema, input));
	await requireFeaturePolicy(ctx, configureAction, catalogResource, 'onboarding_template');
	const row = await ctx.onboardingCatalog.createTemplate({
		name: parsed.name,
		description: parsed.description ?? null
	});
	ctx.audit.log({
		action: 'onboarding_template.created',
		resourceType: 'onboarding_template',
		resourceId: row.id
	});
	return row;
}

export async function updateOnboardingTemplate(
	ctx: OnboardingTemplateWriteContext,
	input: TemplateUpdateInput
): Promise<OnboardingTemplate> {
	const parsed = normalizeTemplateInput(parseInput(templateUpdateSchema, input));
	const id = parsed.id;
	await requireFeaturePolicy(ctx, configureAction, catalogResource, 'onboarding_template', id);
	await requireTemplate(ctx, id);
	const row = await ctx.onboardingCatalog.updateTemplate(id, parsed);
	ctx.audit.log({ action: 'onboarding_template.updated', resourceType: 'onboarding_template', resourceId: id });
	return row;
}

export async function deleteOnboardingTemplate(ctx: OnboardingTemplateWriteContext, templateId: string): Promise<void> {
	await requireFeaturePolicy(ctx, configureAction, catalogResource, 'onboarding_template', templateId);
	if (!(await ctx.onboardingCatalog.deleteTemplate(templateId))) return;
	ctx.audit.log({ action: 'onboarding_template.deleted', resourceType: 'onboarding_template', resourceId: templateId });
}

export async function duplicateOnboardingTemplate(
	ctx: OnboardingTemplateWriteContext,
	input: DuplicateOnboardingTemplateInput
): Promise<DuplicateOnboardingTemplateResult> {
	await requireFeaturePolicy(ctx, configureAction, catalogResource, 'onboarding_template', input.templateId);
	const copy = await ctx.onboardingCatalog.duplicateTemplate(input.templateId, input.requestId);
	if (copy.created) {
		ctx.audit.log({
			action: 'onboarding_template.duplicated',
			resourceType: 'onboarding_template',
			resourceId: copy.template.id,
			details: { sourceTemplateId: input.templateId, stepCount: copy.steps.length }
		});
	}
	return { template: copy.template, templateSteps: copy.steps };
}

export async function createOnboardingTemplateStep(
	ctx: OnboardingTemplateWriteContext,
	input: StepCreateInput
): Promise<OnboardingTemplateStep> {
	const parsed = normalizeStepInput(parseInput(stepCreateSchema, input));
	return insertTemplateStep(ctx, parsed);
}

/** Starter packs retain their deterministic step IDs for concurrent, missing-only application. */
export async function createStarterOnboardingTemplateStep(
	ctx: OnboardingTemplateWriteContext,
	input: StepCreateInput
): Promise<OnboardingTemplateStep> {
	const parsed = normalizeStepInput(parseInput(stepCreateSchema, input));
	return insertTemplateStep(ctx, parsed, deterministicStarterOnboardingStepId(parsed.templateId, parsed.name));
}

async function insertTemplateStep(
	ctx: OnboardingTemplateWriteContext,
	input: Partial<OnboardingTemplateStepData> & Pick<OnboardingTemplateStepData, 'templateId' | 'name' | 'stepType'>,
	id?: string
): Promise<OnboardingTemplateStep> {
	await requireFeaturePolicy(ctx, configureAction, catalogResource, 'onboarding_template_step');
	await requireTemplate(ctx, input.templateId);
	await requireTrainingReference(ctx, input.stepType, input.trainingTypeId);
	const row = await ctx.onboardingCatalog.createStep({
		...input,
		description: input.description ?? null,
		trainingTypeId: input.trainingTypeId ?? null,
		stages: input.stages ?? null,
		sortOrder: input.sortOrder ?? 0,
		...(id ? { id } : {})
	});
	ctx.audit.log({
		action: 'onboarding_template_step.created',
		resourceType: 'onboarding_template_step',
		resourceId: row.id
	});
	return row;
}

export async function updateOnboardingTemplateStep(
	ctx: OnboardingTemplateWriteContext,
	input: StepUpdateInput
): Promise<OnboardingTemplateStep> {
	let parsed = normalizeStepInput(parseInput(stepUpdateSchema, input));
	const id = parsed.id;
	await requireFeaturePolicy(ctx, configureAction, catalogResource, 'onboarding_template_step', id);
	const current = await ctx.onboardingCatalog.findStep(id);
	if (!current) throw error(404, 'Onboarding template step not found');
	if (parsed.templateId !== undefined) await requireTemplate(ctx, parsed.templateId);
	if (parsed.stepType === undefined && (parsed.trainingTypeId !== undefined || parsed.stages !== undefined)) {
		parsed = parseInput(
			stepUpdateSchema,
			normalizeStepInput({
				...parsed,
				stepType: current.stepType,
				trainingTypeId: parsed.trainingTypeId !== undefined ? parsed.trainingTypeId : current.trainingTypeId,
				stages: parsed.stages !== undefined ? parsed.stages : current.stages
			})
		);
	}
	if (parsed.stepType !== undefined || parsed.trainingTypeId !== undefined) {
		await requireTrainingReference(
			ctx,
			parsed.stepType ?? current.stepType,
			parsed.trainingTypeId !== undefined ? parsed.trainingTypeId : current.trainingTypeId
		);
	}
	const row = await ctx.onboardingCatalog.updateStep(id, parsed);
	ctx.audit.log({
		action: 'onboarding_template_step.updated',
		resourceType: 'onboarding_template_step',
		resourceId: id
	});
	return row;
}

export async function deleteOnboardingTemplateStep(ctx: OnboardingTemplateWriteContext, stepId: string): Promise<void> {
	await requireFeaturePolicy(ctx, configureAction, catalogResource, 'onboarding_template_step', stepId);
	const current = await ctx.onboardingCatalog.findStep(stepId);
	if (!current) throw error(404, 'Onboarding template step not found');
	await ctx.onboardingCatalog.deleteStep(stepId);
	ctx.audit.log({
		action: 'onboarding_template_step.deleted',
		resourceType: 'onboarding_template_step',
		resourceId: stepId
	});
}

async function requireTemplate(ctx: OnboardingTemplateWriteContext, templateId: string): Promise<void> {
	const template = await ctx.onboardingCatalog.findTemplate(templateId);
	if (!template) throw error(404, 'Onboarding template not found');
}

async function requireTrainingReference(
	ctx: OnboardingTemplateWriteContext,
	stepType: unknown,
	trainingTypeId: unknown
): Promise<void> {
	if (stepType !== 'training') return;
	if (typeof trainingTypeId !== 'string' || !trainingTypeId) throw error(400, 'Training steps require a Training Type');
	if (!ctx.trainingOnboardingReferences) throw new Error('Training Onboarding references port is required');
	const trainingTypes = await ctx.trainingOnboardingReferences.listTypes(ctx.auth);
	if (!trainingTypes.some((type) => type.id === trainingTypeId))
		throw error(400, 'Training Type is not available for this organization');
}

export async function reorderOnboardingTemplateSteps(
	ctx: OnboardingTemplateWriteContext,
	input: ReorderOnboardingTemplateStepsInput
): Promise<OnboardingTemplateStep[]> {
	await requireFeaturePolicy(ctx, configureAction, catalogResource, 'onboarding_template_step');
	const steps = await ctx.onboardingCatalog.reorderSteps(input.templateId, input.orderedStepIds);
	ctx.audit.log({
		action: 'onboarding_template_step.reordered',
		resourceType: 'onboarding_template_step',
		resourceId: input.templateId,
		details: { templateId: input.templateId, stepCount: input.orderedStepIds.length }
	});
	return steps;
}

function normalizeTemplateInput<T extends Partial<OnboardingTemplateData> & { id?: string }>(input: T): T {
	return {
		...input,
		...(input.id === undefined || input.name !== undefined
			? { name: normalizeRequiredString(input.name, 'Template name is required') }
			: {}),
		...(input.description !== undefined ? { description: normalizeNullableString(input.description) } : {})
	};
}
function normalizeStepInput<T extends Partial<OnboardingTemplateStepData> & { id?: string }>(input: T): T {
	const output = {
		...input,
		...(input.id === undefined || input.name !== undefined
			? { name: normalizeRequiredString(input.name, 'Step name is required') }
			: {}),
		...(input.description !== undefined ? { description: normalizeNullableString(input.description) } : {})
	};
	if (input.stepType === undefined) return output;
	if (input.stepType === 'training') {
		const trainingTypeId = normalizeNullableString(input.trainingTypeId);
		if (!trainingTypeId) throw error(400, 'Training steps require a Training Type');
		return { ...output, trainingTypeId, stages: null };
	}
	return {
		...output,
		trainingTypeId: null,
		stages: input.stepType === 'paperwork' ? normalizeStages(input.stages) : null
	};
}

function normalizeRequiredString(value: unknown, message: string): string {
	if (typeof value !== 'string') {
		throw error(400, message);
	}
	const trimmed = value.trim();
	if (!trimmed) {
		throw error(400, message);
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
