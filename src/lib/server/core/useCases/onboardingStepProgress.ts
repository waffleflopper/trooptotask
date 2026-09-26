/**
 * Onboarding step progress use cases — toggle individual step completion.
 *
 * `toggleCheckbox(ctx, input)` marks a step complete or incomplete.
 *
 * For lifecycle transitions (start, cancel, complete the whole record), see `onboardingLifecycle.ts`.
 */
import { fail } from '$lib/server/core/errors';
import type { OnboardingWorkflowPorts } from './onboardingPolicy';
import { requireOnboardingManagePolicyForStep } from './onboardingPolicy';

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

export async function advanceStage(ctx: OnboardingWorkflowPorts, input: AdvanceStageInput): Promise<StepResult> {
	await requireOnboardingManagePolicyForStep(ctx, input.stepId);

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
		details: { stage_name: input.stageName, completed }
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

interface AddNoteInput {
	stepId: string;
	text: string;
}

interface NoteResult {
	id: string;
	notes: Array<{ text: string; timestamp: string; userId: string }>;
}

export async function addNote(ctx: OnboardingWorkflowPorts, input: AddNoteInput): Promise<NoteResult> {
	await requireOnboardingManagePolicyForStep(ctx, input.stepId);

	const userId = ctx.auth.userId;
	const step = await ctx.store.findOne<{
		id: string;
		notes: Array<{ text: string; timestamp: string; userId: string }>;
	}>('onboarding_step_progress', ctx.auth.orgId, { id: input.stepId });

	if (!step) {
		fail(404, 'Step not found');
	}

	const newNote = {
		text: input.text,
		timestamp: new Date().toISOString(),
		userId
	};

	const updatedNotes = [...(step.notes ?? []), newNote];

	const updated = await ctx.store.update<{
		id: string;
		notes: Array<{ text: string; timestamp: string; userId: string }>;
	}>('onboarding_step_progress', ctx.auth.orgId, input.stepId, {
		notes: updatedNotes
	});

	ctx.audit.log({
		action: 'onboarding_step.note_added',
		resourceType: 'onboarding_step_progress',
		resourceId: input.stepId,
		details: { note_author_user_id: userId }
	});

	return {
		id: updated.id,
		notes: updated.notes
	};
}

export async function removeInactiveStep(ctx: OnboardingWorkflowPorts, stepId: string): Promise<void> {
	await requireOnboardingManagePolicyForStep(ctx, stepId);

	const step = await ctx.store.findOne<{ id: string; active: boolean }>('onboarding_step_progress', ctx.auth.orgId, {
		id: stepId
	});

	if (!step) {
		fail(404, 'Step not found');
	}

	if (step.active) {
		fail(400, 'Only inactive steps can be removed');
	}

	await ctx.store.delete('onboarding_step_progress', ctx.auth.orgId, stepId);

	ctx.audit.log({
		action: 'onboarding_step.inactive_removed',
		resourceType: 'onboarding_step_progress',
		resourceId: stepId
	});
}

export async function toggleCheckbox(ctx: OnboardingWorkflowPorts, input: ToggleCheckboxInput): Promise<StepResult> {
	await requireOnboardingManagePolicyForStep(ctx, input.stepId);

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
