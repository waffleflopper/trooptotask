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
