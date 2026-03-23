import { fail } from '$lib/server/core/errors';
import type { UseCaseContext } from '$lib/server/core/ports';

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

interface TemplateStepRow {
	id: string;
	name: string;
	description: string | null;
	step_type: string;
	training_type_id: string | null;
	stages: string[] | null;
	sort_order: number;
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

async function performDiff(ctx: UseCaseContext, onboardingId: string, templateId: string): Promise<ResyncStepResult[]> {
	// Fetch current template steps
	const templateSteps = await ctx.store.findMany<TemplateStepRow>(
		'onboarding_template_steps',
		ctx.auth.orgId,
		{ template_id: templateId },
		{ orderBy: [{ column: 'sort_order', ascending: true }] }
	);

	// Fetch current instance steps
	const instanceSteps = await ctx.store.findMany<StepProgressRow>('onboarding_step_progress', ctx.auth.orgId, {
		onboarding_id: onboardingId
	});

	const templateStepMap = new Map(templateSteps.map((ts) => [ts.id, ts]));
	const instanceStepMap = new Map(
		instanceSteps.filter((is) => is.template_step_id).map((is) => [is.template_step_id!, is])
	);

	const results: ResyncStepResult[] = [];

	// 1. Steps in instance but not in template → deactivate
	for (const instanceStep of instanceSteps) {
		if (instanceStep.template_step_id && !templateStepMap.has(instanceStep.template_step_id)) {
			const updated = await ctx.store.update<StepProgressRow>(
				'onboarding_step_progress',
				ctx.auth.orgId,
				instanceStep.id,
				{ active: false }
			);
			results.push(mapToResult(updated));
		}
	}

	// 2. Steps in both → update metadata, preserve progress
	for (const [templateStepId, templateStep] of templateStepMap) {
		const instanceStep = instanceStepMap.get(templateStepId);
		if (instanceStep) {
			const updateData: Record<string, unknown> = {
				step_name: templateStep.name,
				step_type: templateStep.step_type,
				training_type_id: templateStep.training_type_id,
				stages: templateStep.stages,
				sort_order: templateStep.sort_order
			};

			// Handle paperwork stage reset
			if (
				templateStep.step_type === 'paperwork' &&
				Array.isArray(templateStep.stages) &&
				templateStep.stages.length > 0
			) {
				const currentStage = instanceStep.current_stage;
				if (currentStage && !templateStep.stages.includes(currentStage)) {
					updateData.current_stage = templateStep.stages[0];
					updateData.completed = false;
				}
			}

			const updated = await ctx.store.update<StepProgressRow>(
				'onboarding_step_progress',
				ctx.auth.orgId,
				instanceStep.id,
				updateData
			);
			results.push(mapToResult(updated));
		}
	}

	// 3. Steps in template but not in instance → insert new
	for (const templateStep of templateSteps) {
		if (!instanceStepMap.has(templateStep.id)) {
			const newRow = {
				onboarding_id: onboardingId,
				template_step_id: templateStep.id,
				step_name: templateStep.name,
				step_type: templateStep.step_type,
				training_type_id: templateStep.training_type_id,
				stages: templateStep.stages,
				sort_order: templateStep.sort_order,
				completed: false,
				current_stage:
					templateStep.step_type === 'paperwork' && Array.isArray(templateStep.stages) && templateStep.stages.length > 0
						? templateStep.stages[0]
						: null,
				notes: [],
				active: true
			};

			const inserted = await ctx.store.insert<StepProgressRow>('onboarding_step_progress', ctx.auth.orgId, newRow);
			results.push(mapToResult(inserted));
		}
	}

	return results;
}

export async function resyncOnboarding(ctx: UseCaseContext, onboardingId: string): Promise<ResyncResult> {
	ctx.auth.requireFullEditor();

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) {
		fail(403, 'Organization is in read-only mode');
	}

	const onboarding = await ctx.store.findOne<{
		id: string;
		template_id: string | null;
	}>('personnel_onboardings', ctx.auth.orgId, { id: onboardingId });

	if (!onboarding) {
		fail(404, 'Onboarding not found');
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

export async function switchTemplate(ctx: UseCaseContext, input: SwitchTemplateInput): Promise<SwitchResult> {
	ctx.auth.requireFullEditor();

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) {
		fail(403, 'Organization is in read-only mode');
	}

	const onboarding = await ctx.store.findOne<{
		id: string;
		template_id: string | null;
	}>('personnel_onboardings', ctx.auth.orgId, { id: input.onboardingId });

	if (!onboarding) {
		fail(404, 'Onboarding not found');
	}

	if (!onboarding.template_id) {
		fail(400, 'Cannot switch template: current template has been deleted');
	}

	const oldTemplateId = onboarding.template_id;

	// Update template_id on the onboarding
	await ctx.store.update('personnel_onboardings', ctx.auth.orgId, input.onboardingId, {
		template_id: input.newTemplateId
	});

	// Run diff against the new template
	const steps = await performDiff(ctx, input.onboardingId, input.newTemplateId);

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
