import { listOnboardingTemplateSteps } from './onboardingTemplateRead.server';
/**
 * Onboarding resync use case — reconciles step progress rows when a template is edited.
 *
 * When steps are added/removed from an onboarding template after active onboarding records
 * exist, `resyncOnboarding(ctx, onboardingId)` adds missing step rows and retains
 * removed steps as inactive history, preserving completion and attributed notes.
 *
 * This is triggered from the template-edit flow, not from normal lifecycle events.
 */
import { fail } from '$lib/errors';
import type { OnboardingWorkflowPorts } from './onboardingPorts.server';
import {
	requireOnboardingConfigurePolicy,
	requireOnboardingManagePolicyForOnboarding
} from './onboardingPolicy.server';

interface StepProgressRow {
	id: string;
	onboarding_id: string;
	template_step_id: string | null;
	step_name: string;
	step_type: string;
	training_type_id: string | null;
	stages: string[] | null;
	sort_order: number;
	completed: boolean;
	current_stage: string | null;
	notes: Array<{ text: string; timestamp: string; userId: string }>;
	active: boolean;
}

interface ResyncStepResult {
	id: string;
	onboardingId: string;
	templateStepId: string | null;
	stepName: string;
	stepType: string;
	trainingTypeId: string | null;
	stages: string[] | null;
	sortOrder: number;
	completed: boolean;
	currentStage: string | null;
	notes: Array<{ text: string; timestamp: string; userId: string }>;
	active: boolean;
}

interface ResyncResult {
	onboardingId: string;
	templateId: string;
	steps: ResyncStepResult[];
}

function mapToResult(row: StepProgressRow): ResyncStepResult {
	return {
		id: row.id,
		onboardingId: row.onboarding_id,
		templateStepId: row.template_step_id,
		stepName: row.step_name,
		stepType: row.step_type,
		trainingTypeId: row.training_type_id,
		stages: row.stages,
		sortOrder: row.sort_order,
		completed: row.completed,
		currentStage: row.current_stage,
		notes: row.notes,
		active: row.active
	};
}

async function performDiff(
	ctx: OnboardingWorkflowPorts,
	onboardingId: string,
	templateId: string,
	matchLegacySteps = false
): Promise<ResyncStepResult[]> {
	// Fetch current template steps
	const templateSteps = await listOnboardingTemplateSteps(ctx.store, ctx.auth.orgId, templateId);

	// Fetch current instance steps
	const instanceSteps = await ctx.store.findMany<StepProgressRow>('onboarding_step_progress', ctx.auth.orgId, {
		onboarding_id: onboardingId
	});

	const templateStepMap = new Map(templateSteps.map((ts) => [ts.id, ts]));
	const instanceStepMap = new Map(
		instanceSteps.filter((is) => is.template_step_id).map((is) => [is.template_step_id!, is])
	);
	// A first template assignment can adopt active legacy work by exact name/type.
	// A normal resync must not adopt a deleted definition's null-reference history.
	if (matchLegacySteps) {
		const legacyByNameAndType = new Map<string, StepProgressRow[]>();
		for (const step of instanceSteps) {
			if (step.template_step_id !== null || !step.active) continue;
			const key = JSON.stringify([step.step_name, step.step_type]);
			const matches = legacyByNameAndType.get(key) ?? [];
			matches.push(step);
			legacyByNameAndType.set(key, matches);
		}
		for (const step of templateSteps) {
			if (instanceStepMap.has(step.id)) continue;
			const legacy = legacyByNameAndType.get(JSON.stringify([step.name, step.stepType]))?.shift();
			if (legacy) instanceStepMap.set(step.id, legacy);
		}
	}
	const matchedIds = new Set(
		templateSteps.map((step) => instanceStepMap.get(step.id)?.id).filter((id) => id !== undefined)
	);

	// Include unchanged inactive history in the immediate response, without a reload.
	const resultRows = new Map(instanceSteps.map((step) => [step.id, step]));
	const existingRowUpserts: Record<string, unknown>[] = [];

	// 1. Steps in instance but not in template → deactivate
	for (const instanceStep of instanceSteps) {
		if (instanceStep.active && !matchedIds.has(instanceStep.id)) {
			existingRowUpserts.push({ ...instanceStep, active: false });
		}
	}

	// 2. Steps in both → update metadata, preserve progress
	for (const [templateStepId, templateStep] of templateStepMap) {
		const instanceStep = instanceStepMap.get(templateStepId);
		if (instanceStep) {
			const updateData: Record<string, unknown> = {
				template_step_id: templateStepId,
				active: true,
				step_name: templateStep.name,
				step_type: templateStep.stepType,
				training_type_id: templateStep.trainingTypeId,
				stages: templateStep.stages,
				sort_order: templateStep.sortOrder
			};

			// Handle paperwork stage reset
			if (
				templateStep.stepType === 'paperwork' &&
				Array.isArray(templateStep.stages) &&
				templateStep.stages.length > 0
			) {
				const currentStage = instanceStep.current_stage;
				if (currentStage && !templateStep.stages.includes(currentStage)) {
					updateData.current_stage = templateStep.stages[0];
					updateData.completed = false;
				}
			}

			existingRowUpserts.push({ ...instanceStep, ...updateData });
		}
	}

	if (existingRowUpserts.length > 0) {
		const upserted = await ctx.store.upsertMany<StepProgressRow>(
			'onboarding_step_progress',
			ctx.auth.orgId,
			existingRowUpserts,
			{ onConflict: 'id' }
		);
		for (const row of upserted) resultRows.set(row.id, row);
	}

	// 3. Steps in template but not in instance → insert new
	const newRows: Record<string, unknown>[] = [];
	for (const templateStep of templateSteps) {
		if (!instanceStepMap.has(templateStep.id)) {
			newRows.push({
				onboarding_id: onboardingId,
				template_step_id: templateStep.id,
				step_name: templateStep.name,
				step_type: templateStep.stepType,
				training_type_id: templateStep.trainingTypeId,
				stages: templateStep.stages,
				sort_order: templateStep.sortOrder,
				completed: false,
				current_stage:
					templateStep.stepType === 'paperwork' && Array.isArray(templateStep.stages) && templateStep.stages.length > 0
						? templateStep.stages[0]
						: null,
				notes: [],
				active: true
			});
		}
	}

	if (newRows.length > 0) {
		const inserted = await ctx.store.insertMany<StepProgressRow>('onboarding_step_progress', ctx.auth.orgId, newRows);
		for (const row of inserted) resultRows.set(row.id, row);
	}

	return [...resultRows.values()].sort((a, b) => a.sort_order - b.sort_order).map(mapToResult);
}

export async function resyncOnboarding(ctx: OnboardingWorkflowPorts, onboardingId: string): Promise<ResyncResult> {
	await requireOnboardingConfigurePolicy(ctx, onboardingId);
	await requireOnboardingManagePolicyForOnboarding(ctx, onboardingId);

	const onboarding = await ctx.store.findOne<{
		id: string;
		status: string;
		template_id: string | null;
	}>('personnel_onboardings', ctx.auth.orgId, { id: onboardingId });

	if (!onboarding) {
		fail(404, 'Onboarding not found');
	}

	if (onboarding.status !== 'in_progress') {
		fail(400, 'Only in-progress onboardings can be resynced');
	}

	if (!onboarding.template_id) {
		fail(400, 'Cannot resync: template has been deleted');
	}

	const steps = await performDiff(ctx, onboardingId, onboarding.template_id);

	ctx.audit.log({
		action: 'onboarding.resynced',
		resourceType: 'personnel_onboarding',
		resourceId: onboardingId,
		details: { templateId: onboarding.template_id }
	});

	return {
		onboardingId,
		templateId: onboarding.template_id,
		steps
	};
}

interface SwitchTemplateInput {
	onboardingId: string;
	newTemplateId: string;
}

interface SwitchResult extends ResyncResult {
	templateId: string;
}

export async function switchTemplate(ctx: OnboardingWorkflowPorts, input: SwitchTemplateInput): Promise<SwitchResult> {
	await requireOnboardingConfigurePolicy(ctx, input.onboardingId);
	await requireOnboardingManagePolicyForOnboarding(ctx, input.onboardingId);

	const onboarding = await ctx.store.findOne<{
		id: string;
		status: string;
		template_id: string | null;
	}>('personnel_onboardings', ctx.auth.orgId, { id: input.onboardingId });

	if (!onboarding) {
		fail(404, 'Onboarding not found');
	}

	if (onboarding.status !== 'in_progress') {
		fail(400, 'Only in-progress onboardings can switch templates');
	}

	const oldTemplateId = onboarding.template_id;

	const assigningLegacy = oldTemplateId === null;
	if (assigningLegacy) {
		const template = await ctx.store.findOne<{ id: string }>(
			'onboarding_templates',
			ctx.auth.orgId,
			{ id: input.newTemplateId },
			'id'
		);
		if (!template) fail(404, 'Onboarding template not found');
	}
	const assignTemplate = () =>
		ctx.store.update('personnel_onboardings', ctx.auth.orgId, input.onboardingId, {
			template_id: input.newTemplateId
		});
	// Keep a first assignment retryable if progress persistence fails. Existing SQL
	// checks each definition's Organization, without requiring the parent template first.
	if (!assigningLegacy) await assignTemplate();
	const steps = await performDiff(ctx, input.onboardingId, input.newTemplateId, assigningLegacy);
	if (assigningLegacy) await assignTemplate();

	ctx.audit.log({
		action: 'onboarding.template_switched',
		resourceType: 'personnel_onboarding',
		resourceId: input.onboardingId,
		details: { oldTemplateId, newTemplateId: input.newTemplateId }
	});

	return {
		onboardingId: input.onboardingId,
		templateId: input.newTemplateId,
		steps
	};
}
