import { createHash } from 'node:crypto';
import type { z } from 'zod';
import { error } from '@sveltejs/kit';
import { OnboardingTemplateEntity } from './onboardingTemplateEntity.server';
import { OnboardingTemplateStepEntity } from './onboardingTemplateStepEntity.server';
import type { OnboardingTemplate, OnboardingTemplateStep, OnboardingStepType } from '../contracts';
import type { OnboardingTemplateWriteContext } from './onboardingTemplatePorts.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireFeaturePolicy } from '$lib/access/index.server';

const TEMPLATE_CLEAR_BATCH_SIZE = 25;
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

function parseInput<T>(schema: z.ZodType<T>, input: Record<string, unknown>): T {
	const parsed = schema.safeParse(input);
	if (!parsed.success) throw error(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	return parsed.data;
}

export async function createOnboardingTemplate(
	ctx: OnboardingTemplateWriteContext,
	input: TemplateCreateInput
): Promise<OnboardingTemplate> {
	const parsed = normalizeTemplateInput(parseInput(OnboardingTemplateEntity.createSchema, input));
	await requireFeaturePolicy(ctx, configureAction, catalogResource, 'onboarding_template');
	const row = await ctx.store.insert<Record<string, unknown>>(
		OnboardingTemplateEntity.table,
		ctx.auth.orgId,
		OnboardingTemplateEntity.toDbInsert(parsed, ctx.auth.orgId),
		OnboardingTemplateEntity.select
	);
	ctx.audit.log({
		action: 'onboarding_template.created',
		resourceType: 'onboarding_template',
		resourceId: row.id as string | undefined
	});
	return OnboardingTemplateEntity.fromDb(row);
}

export async function updateOnboardingTemplate(
	ctx: OnboardingTemplateWriteContext,
	input: TemplateUpdateInput
): Promise<OnboardingTemplate> {
	const parsed = normalizeTemplateInput(parseInput(OnboardingTemplateEntity.updateSchema, input));
	const id = parsed.id as string;
	await requireFeaturePolicy(ctx, configureAction, catalogResource, 'onboarding_template', id);
	await requireTemplate(ctx, id);
	const row = await ctx.store.update<Record<string, unknown>>(
		OnboardingTemplateEntity.table,
		ctx.auth.orgId,
		id,
		OnboardingTemplateEntity.toDbUpdate(parsed),
		OnboardingTemplateEntity.select
	);
	ctx.audit.log({ action: 'onboarding_template.updated', resourceType: 'onboarding_template', resourceId: id });
	return OnboardingTemplateEntity.fromDb(row);
}

export async function deleteOnboardingTemplate(ctx: OnboardingTemplateWriteContext, templateId: string): Promise<void> {
	await requireFeaturePolicy(ctx, configureAction, catalogResource, 'onboarding_template', templateId);
	await requireTemplate(ctx, templateId);
	await ctx.store.delete(OnboardingTemplateEntity.table, ctx.auth.orgId, templateId);
	ctx.audit.log({ action: 'onboarding_template.deleted', resourceType: 'onboarding_template', resourceId: templateId });
	await deleteTemplateDependents(ctx, templateId);
}

export async function createOnboardingTemplateStep(
	ctx: OnboardingTemplateWriteContext,
	input: StepCreateInput
): Promise<OnboardingTemplateStep> {
	const parsed = normalizeStepInput(parseInput(OnboardingTemplateStepEntity.createSchema, input));
	return insertTemplateStep(ctx, parsed);
}

/** Starter packs retain their deterministic step IDs for concurrent, missing-only application. */
export async function createStarterOnboardingTemplateStep(
	ctx: OnboardingTemplateWriteContext,
	input: StepCreateInput
): Promise<OnboardingTemplateStep> {
	const parsed = normalizeStepInput(parseInput(OnboardingTemplateStepEntity.createSchema, input));
	return insertTemplateStep(
		ctx,
		parsed,
		deterministicStarterOnboardingStepId(parsed.templateId as string, parsed.name as string)
	);
}

async function insertTemplateStep(
	ctx: OnboardingTemplateWriteContext,
	input: Record<string, unknown>,
	id?: string
): Promise<OnboardingTemplateStep> {
	await requireFeaturePolicy(ctx, configureAction, catalogResource, 'onboarding_template_step');
	await requireTemplate(ctx, input.templateId as string);
	await requireTrainingReference(ctx, input.stepType, input.trainingTypeId);
	const data = OnboardingTemplateStepEntity.toDbInsert(input, ctx.auth.orgId);
	const row = await ctx.store.insert<Record<string, unknown>>(
		OnboardingTemplateStepEntity.table,
		ctx.auth.orgId,
		{ ...data, ...(id ? { id } : {}) },
		OnboardingTemplateStepEntity.select
	);
	ctx.audit.log({
		action: 'onboarding_template_step.created',
		resourceType: 'onboarding_template_step',
		resourceId: row.id as string | undefined
	});
	return OnboardingTemplateStepEntity.fromDb(row);
}

export async function updateOnboardingTemplateStep(
	ctx: OnboardingTemplateWriteContext,
	input: StepUpdateInput
): Promise<OnboardingTemplateStep> {
	let parsed = normalizeStepInput(parseInput(OnboardingTemplateStepEntity.updateSchema, input));
	const id = parsed.id as string;
	await requireFeaturePolicy(ctx, configureAction, catalogResource, 'onboarding_template_step', id);
	const current = await ctx.store.findOne<Record<string, unknown>>(OnboardingTemplateStepEntity.table, ctx.auth.orgId, {
		id
	});
	if (!current) throw error(404, 'Onboarding template step not found');
	if (parsed.templateId !== undefined) await requireTemplate(ctx, parsed.templateId as string);
	if (parsed.stepType === undefined && (parsed.trainingTypeId !== undefined || parsed.stages !== undefined)) {
		parsed = parseInput(
			OnboardingTemplateStepEntity.updateSchema,
			normalizeStepInput({
				...parsed,
				stepType: current.step_type,
				trainingTypeId: parsed.trainingTypeId !== undefined ? parsed.trainingTypeId : current.training_type_id,
				stages: parsed.stages !== undefined ? parsed.stages : current.stages
			})
		);
	}
	if (parsed.stepType !== undefined || parsed.trainingTypeId !== undefined) {
		await requireTrainingReference(
			ctx,
			parsed.stepType ?? current.step_type,
			parsed.trainingTypeId !== undefined ? parsed.trainingTypeId : current.training_type_id
		);
	}
	const row = await ctx.store.update<Record<string, unknown>>(
		OnboardingTemplateStepEntity.table,
		ctx.auth.orgId,
		id,
		OnboardingTemplateStepEntity.toDbUpdate(parsed),
		OnboardingTemplateStepEntity.select
	);
	ctx.audit.log({
		action: 'onboarding_template_step.updated',
		resourceType: 'onboarding_template_step',
		resourceId: id
	});
	return OnboardingTemplateStepEntity.fromDb(row);
}

export async function deleteOnboardingTemplateStep(ctx: OnboardingTemplateWriteContext, stepId: string): Promise<void> {
	await requireFeaturePolicy(ctx, configureAction, catalogResource, 'onboarding_template_step', stepId);
	const current = await ctx.store.findOne<{ id: string }>(
		OnboardingTemplateStepEntity.table,
		ctx.auth.orgId,
		{ id: stepId },
		'id'
	);
	if (!current) throw error(404, 'Onboarding template step not found');
	await ctx.store.delete(OnboardingTemplateStepEntity.table, ctx.auth.orgId, stepId);
	ctx.audit.log({
		action: 'onboarding_template_step.deleted',
		resourceType: 'onboarding_template_step',
		resourceId: stepId
	});
}

async function requireTemplate(ctx: OnboardingTemplateWriteContext, templateId: string): Promise<void> {
	const template = await ctx.store.findOne<{ id: string }>(
		OnboardingTemplateEntity.table,
		ctx.auth.orgId,
		{ id: templateId },
		'id'
	);
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
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.onboarding.configureWorkflows,
		{ kind: 'organization' },
		'onboarding_template_step'
	);

	await requireTemplate(ctx, input.templateId);

	const currentRows = await ctx.store.findMany<Record<string, unknown>>(
		OnboardingTemplateStepEntity.table,
		ctx.auth.orgId,
		{ template_id: input.templateId },
		{ orderBy: [{ column: 'sort_order', ascending: true }] }
	);
	const currentSteps = OnboardingTemplateStepEntity.fromDbArray(currentRows);
	const currentIds = new Set(currentSteps.map((step) => step.id));

	const orderedIds = new Set(input.orderedStepIds);
	if (
		orderedIds.size !== input.orderedStepIds.length ||
		input.orderedStepIds.length !== currentIds.size ||
		input.orderedStepIds.some((id) => !currentIds.has(id))
	) {
		throw error(409, 'Step order does not match the selected onboarding template');
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

async function deleteTemplateDependents(ctx: OnboardingTemplateWriteContext, templateId: string): Promise<void> {
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
			throw error(400, 'Training steps require a Training Type');
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
