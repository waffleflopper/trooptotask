import { fail } from '$lib/server/core/errors';
import type { UseCaseContext } from '$lib/server/core/ports';

interface ToggleCheckboxInput {
	stepId: string;
	completed: boolean;
}

interface StepResult {
	id: string;
	onboardingId: string;
	stepName: string;
	stepType: string;
	completed: boolean;
	currentStage: string | null;
}

interface AdvanceStageInput {
	stepId: string;
	stageName: string;
}

export async function advanceStage(ctx: UseCaseContext, input: AdvanceStageInput): Promise<StepResult> {
	ctx.auth.requireEdit('onboarding');

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) {
		fail(403, 'Organization is in read-only mode');
	}

	const step = await ctx.store.findOne<{
		id: string;
		onboarding_id: string;
		step_name: string;
		step_type: string;
		stages: string[] | null;
		completed: boolean;
		current_stage: string | null;
	}>('onboarding_step_progress', ctx.auth.orgId, { id: input.stepId });

	if (!step) {
		fail(404, 'Step not found');
	}

	if (step.step_type !== 'paperwork') {
		fail(400, 'Only paperwork steps can be advanced');
	}

	const stages = step.stages ?? [];
	if (!stages.includes(input.stageName)) {
		fail(400, 'Invalid stage name');
	}

	const isLastStage = input.stageName === stages[stages.length - 1];
	const completed = isLastStage;

	const updated = await ctx.store.update<{
		id: string;
		onboarding_id: string;
		step_name: string;
		step_type: string;
		completed: boolean;
		current_stage: string | null;
	}>('onboarding_step_progress', ctx.auth.orgId, input.stepId, {
		current_stage: input.stageName,
		completed
	});

	ctx.audit.log({
		action: 'onboarding_step.stage_advanced',
		resourceType: 'onboarding_step_progress',
		resourceId: input.stepId,
		details: { stageName: input.stageName, completed }
	});

	return {
		id: updated.id,
		onboardingId: updated.onboarding_id,
		stepName: updated.step_name,
		stepType: updated.step_type,
		completed: updated.completed,
		currentStage: updated.current_stage
	};
}

export async function toggleCheckbox(ctx: UseCaseContext, input: ToggleCheckboxInput): Promise<StepResult> {
	ctx.auth.requireEdit('onboarding');

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) {
		fail(403, 'Organization is in read-only mode');
	}

	// Fetch the step
	const step = await ctx.store.findOne<{
		id: string;
		onboarding_id: string;
		step_name: string;
		step_type: string;
		completed: boolean;
		current_stage: string | null;
	}>('onboarding_step_progress', ctx.auth.orgId, { id: input.stepId });

	if (!step) {
		fail(404, 'Step not found');
	}

	if (step.step_type !== 'checkbox') {
		fail(400, 'Only checkbox steps can be toggled');
	}

	const updated = await ctx.store.update<{
		id: string;
		onboarding_id: string;
		step_name: string;
		step_type: string;
		completed: boolean;
		current_stage: string | null;
	}>('onboarding_step_progress', ctx.auth.orgId, input.stepId, {
		completed: input.completed
	});

	ctx.audit.log({
		action: 'onboarding_step.toggled',
		resourceType: 'onboarding_step_progress',
		resourceId: input.stepId,
		details: { completed: input.completed }
	});

	return {
		id: updated.id,
		onboardingId: updated.onboarding_id,
		stepName: updated.step_name,
		stepType: updated.step_type,
		completed: updated.completed,
		currentStage: updated.current_stage
	};
}
