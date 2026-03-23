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

interface RefreshTrainingInput {
	onboardingId: string;
}

interface TrainingStepResult {
	id: string;
	onboardingId: string;
	stepName: string;
	stepType: string;
	trainingTypeId: string | null;
	completed: boolean;
}

export async function refreshTrainingSteps(
	ctx: UseCaseContext,
	input: RefreshTrainingInput
): Promise<TrainingStepResult[]> {
	// Fetch the onboarding to get the personnel_id
	const onboarding = await ctx.store.findOne<{ id: string; personnel_id: string }>(
		'personnel_onboardings',
		ctx.auth.orgId,
		{ id: input.onboardingId }
	);
	if (!onboarding) {
		fail(404, 'Onboarding not found');
	}

	// Fetch all training-type steps for this onboarding
	const allSteps = await ctx.store.findMany<{
		id: string;
		onboarding_id: string;
		step_name: string;
		step_type: string;
		training_type_id: string | null;
		completed: boolean;
		active: boolean;
	}>('onboarding_step_progress', ctx.auth.orgId, {
		onboarding_id: input.onboardingId,
		step_type: 'training'
	});

	const trainingSteps = allSteps.filter((s) => s.active && s.training_type_id);
	if (trainingSteps.length === 0) {
		return [];
	}

	// Targeted query: only this soldier's training records for the specific training type IDs
	const trainingTypeIds = trainingSteps.map((s) => s.training_type_id!);
	const trainingRecords = await ctx.store.findMany<{ training_type_id: string }>(
		'personnel_trainings',
		ctx.auth.orgId,
		{ personnel_id: onboarding.personnel_id },
		{ inFilters: { training_type_id: trainingTypeIds } }
	);

	const completedTypeIds = new Set(trainingRecords.map((r) => r.training_type_id));

	// Update each training step's completed status
	const results: TrainingStepResult[] = [];
	for (const step of trainingSteps) {
		const completed = completedTypeIds.has(step.training_type_id!);
		if (step.completed !== completed) {
			await ctx.store.update('onboarding_step_progress', ctx.auth.orgId, step.id, { completed });
		}
		results.push({
			id: step.id,
			onboardingId: step.onboarding_id,
			stepName: step.step_name,
			stepType: step.step_type,
			trainingTypeId: step.training_type_id,
			completed
		});
	}

	return results;
}

interface AddNoteInput {
	stepId: string;
	text: string;
	userId: string;
}

interface NoteResult {
	id: string;
	notes: Array<{ text: string; timestamp: string; userId: string }>;
}

export async function addNote(ctx: UseCaseContext, input: AddNoteInput): Promise<NoteResult> {
	ctx.auth.requireEdit('onboarding');

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) {
		fail(403, 'Organization is in read-only mode');
	}

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
		userId: input.userId
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
		details: { userId: input.userId }
	});

	return {
		id: updated.id,
		notes: updated.notes
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
