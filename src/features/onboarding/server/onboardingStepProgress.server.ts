import { fail } from '$lib/errors';
import type { OnboardingNoteAppendResult } from '../contracts';
import type {
	OnboardingWorkflowPorts,
	OnboardingNoteAppendPorts,
	OnboardingInactiveStepRemovalPorts
} from './onboardingPorts.server';
import { requireOnboardingManagePolicyForStep } from './onboardingPolicy.server';
import { trainingStepsAreManual, onboardingStepResponse } from './manualTrainingSteps.server';

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
	progressChangedAt: string;
}

interface AdvanceStageInput {
	stepId: string;
	stageName: string;
}

export async function advanceStage(ctx: OnboardingWorkflowPorts, input: AdvanceStageInput): Promise<StepResult> {
	await requireOnboardingManagePolicyForStep(ctx, input.stepId);

	const step = await ctx.onboardingWorkflow.findStepReference(input.stepId);

	if (!step) {
		fail(404, 'Step not found');
	}

	if (step.stepType !== 'paperwork') {
		fail(400, 'Only paperwork steps can be advanced');
	}

	const stages = step.stages ?? [];
	if (!stages.includes(input.stageName)) {
		fail(400, 'Invalid stage name');
	}

	const isLastStage = input.stageName === stages[stages.length - 1];
	const completed = isLastStage;

	const updated = await ctx.onboardingWorkflow.savePaperworkProgress(input.stepId, input.stageName, completed);

	ctx.audit.log({
		action: 'onboarding_step.stage_advanced',
		resourceType: 'onboarding_step_progress',
		resourceId: input.stepId,
		details: { stage_name: input.stageName, completed }
	});

	return onboardingStepResponse(ctx, {
		id: updated.id,
		onboardingId: updated.onboardingId,
		stepName: updated.stepName,
		stepType: updated.stepType,
		completed: updated.completed,
		currentStage: updated.currentStage,
		progressChangedAt: updated.progressChangedAt
	});
}

interface AddNoteInput {
	stepId: string;
	text: string;
}

export async function addNote(
	ctx: OnboardingNoteAppendPorts,
	input: AddNoteInput
): Promise<OnboardingNoteAppendResult> {
	await requireOnboardingManagePolicyForStep(ctx, input.stepId);

	if (!ctx.onboardingNoteAppend) throw new Error('Bind the owned Onboarding note append provider');
	const result = await ctx.onboardingNoteAppend.append(ctx.auth.orgId, input.stepId, input.text);

	ctx.audit.log({
		action: 'onboarding_step.note_added',
		resourceType: 'onboarding_step_progress',
		resourceId: input.stepId,
		details: { note_author_user_id: ctx.auth.userId }
	});

	return result;
}

export async function removeInactiveStep(ctx: OnboardingInactiveStepRemovalPorts, stepId: string): Promise<void> {
	await requireOnboardingManagePolicyForStep(ctx, stepId);

	const step = await ctx.onboardingWorkflow.findStepReference(stepId);

	if (!step) {
		fail(404, 'Step not found');
	}

	if (step.active) {
		fail(400, 'Only inactive steps can be removed');
	}

	if (!ctx.onboardingInactiveStepRemoval) throw new Error('Bind the owned Onboarding inactive step removal provider');
	const removed = await ctx.onboardingInactiveStepRemoval.remove(ctx.auth.orgId, stepId);
	if (!removed) fail(409, 'Step changed before removal; reload and try again');

	ctx.audit.log({
		action: 'onboarding_step.inactive_removed',
		resourceType: 'onboarding_step_progress',
		resourceId: removed.id
	});
}

export async function toggleCheckbox(ctx: OnboardingWorkflowPorts, input: ToggleCheckboxInput): Promise<StepResult> {
	await requireOnboardingManagePolicyForStep(ctx, input.stepId);

	const step = await ctx.onboardingWorkflow.findStepReference(input.stepId);

	if (!step) {
		fail(404, 'Step not found');
	}

	if (step.stepType !== 'checkbox' && !(step.stepType === 'training' && trainingStepsAreManual(ctx))) {
		fail(400, 'Only checkbox steps can be toggled');
	}

	const updated = await ctx.onboardingWorkflow.saveCheckboxCompletion(input.stepId, input.completed);

	ctx.audit.log({
		action: 'onboarding_step.toggled',
		resourceType: 'onboarding_step_progress',
		resourceId: input.stepId,
		details: { completed: input.completed }
	});

	return onboardingStepResponse(ctx, {
		id: updated.id,
		onboardingId: updated.onboardingId,
		stepName: updated.stepName,
		stepType: updated.stepType,
		completed: updated.completed,
		currentStage: updated.currentStage,
		progressChangedAt: updated.progressChangedAt
	});
}
