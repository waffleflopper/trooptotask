import { fail } from '$lib/server/core/errors';
import type { WritePorts } from '$lib/server/core/ports';

interface StartInput {
	personnelId: string;
	templateId: string;
}

interface StepResult {
	id: string;
	onboardingId: string;
	stepName: string;
	stepType: string;
	trainingTypeId: string | null;
	stages: string[] | null;
	sortOrder: number;
	completed: boolean;
	currentStage: string | null;
	notes: Array<{ text: string; timestamp: string }>;
	templateStepId: string | null;
	active: boolean;
}

interface StartResult {
	id: string;
	personnelId: string;
	templateId: string;
	status: string;
	startedAt: string;
	completedAt: string | null;
	cancelledAt: string | null;
	steps: StepResult[];
}

export async function startOnboarding(ctx: WritePorts, input: StartInput): Promise<StartResult> {
	ctx.auth.requireEdit('onboarding');

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) {
		fail(403, 'Organization is in read-only mode');
	}

	// Enforce one-active-per-soldier
	const existing = await ctx.store.findMany<{ id: string }>('personnel_onboardings', ctx.auth.orgId, {
		personnel_id: input.personnelId,
		status: 'in_progress'
	});
	if (existing.length > 0) {
		fail(409, 'Soldier already has an active onboarding');
	}

	// Fetch template steps
	const templateSteps = await ctx.store.findMany<{
		id: string;
		name: string;
		step_type: string;
		training_type_id: string | null;
		stages: string[] | null;
		sort_order: number;
	}>(
		'onboarding_template_steps',
		ctx.auth.orgId,
		{ template_id: input.templateId },
		{
			orderBy: [{ column: 'sort_order', ascending: true }]
		}
	);

	// Create onboarding record
	const now = new Date().toISOString();
	const onboarding = await ctx.store.insert<{ id: string }>('personnel_onboardings', ctx.auth.orgId, {
		personnel_id: input.personnelId,
		template_id: input.templateId,
		status: 'in_progress',
		started_at: now,
		completed_at: null,
		cancelled_at: null
	});

	// Check training records for training-type steps (targeted query)
	const trainingTypeIds = templateSteps
		.filter((ts) => ts.step_type === 'training' && ts.training_type_id)
		.map((ts) => ts.training_type_id!);

	const completedTrainingTypeIds = new Set<string>();
	if (trainingTypeIds.length > 0) {
		const trainingRecords = await ctx.store.findMany<{ training_type_id: string }>(
			'personnel_trainings',
			ctx.auth.orgId,
			{ personnel_id: input.personnelId },
			{ inFilters: { training_type_id: trainingTypeIds } }
		);
		for (const rec of trainingRecords) {
			completedTrainingTypeIds.add(rec.training_type_id);
		}
	}

	// Snapshot template steps into step progress rows
	const stepRows = templateSteps.map((ts) => ({
		onboarding_id: onboarding.id,
		step_name: ts.name,
		step_type: ts.step_type,
		training_type_id: ts.training_type_id,
		stages: ts.stages,
		sort_order: ts.sort_order,
		completed:
			ts.step_type === 'training' && ts.training_type_id ? completedTrainingTypeIds.has(ts.training_type_id) : false,
		current_stage:
			ts.step_type === 'paperwork' && Array.isArray(ts.stages) && ts.stages.length > 0 ? ts.stages[0] : null,
		notes: [],
		template_step_id: ts.id,
		active: true
	}));

	const steps = await ctx.store.insertMany<{
		id: string;
		onboarding_id: string;
		step_name: string;
		step_type: string;
		training_type_id: string | null;
		stages: string[] | null;
		sort_order: number;
		completed: boolean;
		current_stage: string | null;
		notes: Array<{ text: string; timestamp: string }>;
		template_step_id: string | null;
		active: boolean;
	}>('onboarding_step_progress', ctx.auth.orgId, stepRows);

	ctx.audit.log({
		action: 'onboarding.started',
		resourceType: 'personnel_onboarding',
		resourceId: onboarding.id,
		details: { personnelId: input.personnelId, templateId: input.templateId }
	});

	return {
		id: onboarding.id,
		personnelId: input.personnelId,
		templateId: input.templateId,
		status: 'in_progress',
		startedAt: now,
		completedAt: null,
		cancelledAt: null,
		steps: steps.map((s) => ({
			id: s.id,
			onboardingId: s.onboarding_id,
			stepName: s.step_name,
			stepType: s.step_type,
			trainingTypeId: s.training_type_id,
			stages: s.stages,
			sortOrder: s.sort_order,
			completed: s.completed,
			currentStage: s.current_stage,
			notes: s.notes,
			templateStepId: s.template_step_id,
			active: s.active
		}))
	};
}

interface LifecycleResult {
	id: string;
	status: string;
	cancelledAt: string | null;
	completedAt: string | null;
}

export async function cancelOnboarding(ctx: WritePorts, id: string): Promise<LifecycleResult> {
	ctx.auth.requireEdit('onboarding');

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) {
		fail(403, 'Organization is in read-only mode');
	}

	const onboarding = await ctx.store.findOne<{ id: string; status: string }>('personnel_onboardings', ctx.auth.orgId, {
		id
	});
	if (!onboarding) {
		fail(404, 'Onboarding not found');
	}

	if (onboarding.status !== 'in_progress') {
		fail(400, 'Only in-progress onboardings can be cancelled');
	}

	const now = new Date().toISOString();
	const updated = await ctx.store.update<{
		id: string;
		status: string;
		cancelled_at: string | null;
		completed_at: string | null;
	}>('personnel_onboardings', ctx.auth.orgId, id, {
		status: 'cancelled',
		cancelled_at: now
	});

	ctx.audit.log({
		action: 'onboarding.cancelled',
		resourceType: 'personnel_onboarding',
		resourceId: id
	});

	return {
		id: updated.id,
		status: updated.status,
		cancelledAt: updated.cancelled_at,
		completedAt: updated.completed_at
	};
}

export async function reopenOnboarding(ctx: WritePorts, id: string): Promise<LifecycleResult> {
	ctx.auth.requireEdit('onboarding');

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) {
		fail(403, 'Organization is in read-only mode');
	}

	const onboarding = await ctx.store.findOne<{ id: string; status: string }>('personnel_onboardings', ctx.auth.orgId, {
		id
	});
	if (!onboarding) {
		fail(404, 'Onboarding not found');
	}

	if (onboarding.status !== 'cancelled') {
		fail(400, 'Only cancelled onboardings can be reopened');
	}

	const updated = await ctx.store.update<{
		id: string;
		status: string;
		cancelled_at: string | null;
		completed_at: string | null;
	}>('personnel_onboardings', ctx.auth.orgId, id, {
		status: 'in_progress',
		cancelled_at: null
	});

	ctx.audit.log({
		action: 'onboarding.reopened',
		resourceType: 'personnel_onboarding',
		resourceId: id
	});

	return {
		id: updated.id,
		status: updated.status,
		cancelledAt: updated.cancelled_at,
		completedAt: updated.completed_at
	};
}

interface CompleteResult extends LifecycleResult {
	incompleteCount: number;
}

export async function completeOnboarding(ctx: WritePorts, id: string): Promise<CompleteResult> {
	ctx.auth.requireEdit('onboarding');

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) {
		fail(403, 'Organization is in read-only mode');
	}

	const onboarding = await ctx.store.findOne<{ id: string; status: string }>('personnel_onboardings', ctx.auth.orgId, {
		id
	});
	if (!onboarding) {
		fail(404, 'Onboarding not found');
	}

	if (onboarding.status !== 'in_progress') {
		fail(400, 'Only in-progress onboardings can be completed');
	}

	// Count incomplete active steps (type-agnostic)
	const incompleteSteps = await ctx.store.findMany<{ id: string }>('onboarding_step_progress', ctx.auth.orgId, {
		onboarding_id: id,
		active: true,
		completed: false
	});

	const now = new Date().toISOString();
	const updated = await ctx.store.update<{
		id: string;
		status: string;
		cancelled_at: string | null;
		completed_at: string | null;
	}>('personnel_onboardings', ctx.auth.orgId, id, {
		status: 'completed',
		completed_at: now
	});

	ctx.audit.log({
		action: 'onboarding.completed',
		resourceType: 'personnel_onboarding',
		resourceId: id,
		details: { incompleteCount: incompleteSteps.length }
	});

	return {
		id: updated.id,
		status: updated.status,
		cancelledAt: updated.cancelled_at,
		completedAt: updated.completed_at,
		incompleteCount: incompleteSteps.length
	};
}
