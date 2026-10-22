/**
 * Lifecycle transitions require the expected saved status at the parent mutation.
 */
import { fail } from '$lib/errors';
import type { OnboardingTrainingPorts, OnboardingLifecyclePorts } from './onboardingPorts.server';
import type { OnboardingLifecycleTransition } from '../contracts';
import { subjectDetails } from '$lib/audit/index.server';
import { formatToday, isDateOnly } from '$lib/utils/dates';
import { isUuid } from '$lib/utils/inputSchemas';
import {
	requireOnboardingManagePolicyForOnboarding,
	requireOnboardingManagePolicyForPersonnel
} from './onboardingPolicy.server';
import { asManualTrainingSteps, trainingStepsAreManual } from './manualTrainingSteps.server';

interface StartInput {
	personnelId: string;
	templateId: string;
	startedAt?: string;
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

export async function startOnboarding(ctx: OnboardingTrainingPorts, input: StartInput): Promise<StartResult> {
	await requireOnboardingManagePolicyForPersonnel(ctx, input.personnelId);

	if (!isUuid(input.templateId)) fail(400, 'A configured onboarding template is required');

	// Enforce one-active-per-soldier before preparing a new packet. The creation
	// transaction also enforces the existing unique index for overlapping starts.
	const existing = await ctx.onboardingWorkflow.listActivePacketIdsForPersonnel(input.personnelId);
	if (existing.length > 0) {
		fail(409, 'Soldier already has an active onboarding');
	}

	const startedAt = resolveStartedAt(input.startedAt);
	const templateSteps = await ctx.onboardingCatalog.listSteps(input.templateId);
	const trainingTypeIds = templateSteps
		.filter((step) => step.stepType === 'training' && step.trainingTypeId)
		.map((step) => step.trainingTypeId!);
	const completedTrainingTypeIds =
		trainingTypeIds.length > 0
			? ((await ctx.trainingOnboardingReferences.completedTypeIds(ctx.auth, [input.personnelId], trainingTypeIds)).get(
					input.personnelId
				) ?? new Set<string>())
			: new Set<string>();

	if (!ctx.onboardingPacketCreation) throw new Error('Bind the owned Onboarding packet creation provider');
	const { onboarding, steps } = await ctx.onboardingPacketCreation.create(ctx.auth.orgId, {
		personnelId: input.personnelId,
		templateId: input.templateId,
		startedAt,
		steps: templateSteps.map((step) => ({
			template_step_id: step.id,
			step_name: step.name,
			step_type: step.stepType,
			training_type_id: step.trainingTypeId,
			stages: step.stages,
			sort_order: step.sortOrder,
			completed:
				step.stepType === 'training' && step.trainingTypeId ? completedTrainingTypeIds.has(step.trainingTypeId) : false
		}))
	});

	ctx.audit.log({
		action: 'onboarding.started',
		resourceType: 'personnel_onboarding',
		resourceId: onboarding.id,
		details: {
			...subjectDetails({ subjectType: 'personnel', subjectId: onboarding.personnel_id }),
			template_id: onboarding.template_id
		}
	});

	const startedSteps = steps.map((step) => ({
		id: step.id,
		onboardingId: step.onboarding_id,
		stepName: step.step_name,
		stepType: step.step_type,
		trainingTypeId: step.training_type_id,
		stages: step.stages,
		sortOrder: step.sort_order,
		completed: step.completed,
		currentStage: step.current_stage,
		notes: step.notes,
		templateStepId: step.template_step_id,
		active: step.active,
		progressChangedAt: step.progress_changed_at
	}));

	return {
		id: onboarding.id,
		personnelId: onboarding.personnel_id,
		templateId: onboarding.template_id,
		status: onboarding.status,
		startedAt: onboarding.started_at,
		completedAt: onboarding.completed_at,
		cancelledAt: onboarding.cancelled_at,
		steps: trainingStepsAreManual(ctx) ? asManualTrainingSteps(startedSteps) : startedSteps
	};
}

function resolveStartedAt(startedAt?: string): string {
	if (startedAt === undefined) {
		return formatToday();
	}

	if (!isDateOnly(startedAt)) fail(400, 'Start date must be a valid date (YYYY-MM-DD)');

	return startedAt;
}

interface LifecycleResult {
	id: string;
	status: string;
	cancelledAt: string | null;
	completedAt: string | null;
}

async function persistTransition(ctx: OnboardingLifecyclePorts, id: string, command: OnboardingLifecycleTransition) {
	if (!ctx.onboardingLifecycleTransition) throw new Error('Bind the owned Onboarding lifecycle transition provider');
	const updated = await ctx.onboardingLifecycleTransition.transition(ctx.auth.orgId, id, command);
	if (!updated) fail(409, 'Onboarding changed before the transition could be saved');
	return updated;
}

export async function cancelOnboarding(ctx: OnboardingLifecyclePorts, id: string): Promise<LifecycleResult> {
	await requireOnboardingManagePolicyForOnboarding(ctx, id);

	const onboarding = await ctx.onboardingWorkflow.findPacketReference(id);
	if (!onboarding) {
		fail(404, 'Onboarding not found');
	}

	if (onboarding.status !== 'in_progress') {
		fail(400, 'Only in-progress onboardings can be cancelled');
	}

	const updated = await persistTransition(ctx, id, { kind: 'cancel', at: new Date().toISOString() });

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

export async function reopenOnboarding(ctx: OnboardingLifecyclePorts, id: string): Promise<LifecycleResult> {
	await requireOnboardingManagePolicyForOnboarding(ctx, id);

	const onboarding = await ctx.onboardingWorkflow.findPacketReference(id);
	if (!onboarding) {
		fail(404, 'Onboarding not found');
	}

	if (onboarding.status !== 'cancelled') {
		fail(400, 'Only cancelled onboardings can be reopened');
	}

	const updated = await persistTransition(ctx, id, { kind: 'reopen' });

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

/** `completedOn` is the member's local calendar day; the database admits only a day within one UTC day of its own. */
export async function completeOnboarding(
	ctx: OnboardingLifecyclePorts,
	id: string,
	completedOn: string
): Promise<CompleteResult> {
	await requireOnboardingManagePolicyForOnboarding(ctx, id);

	const onboarding = await ctx.onboardingWorkflow.findPacketReference(id);
	if (!onboarding) {
		fail(404, 'Onboarding not found');
	}

	if (onboarding.status !== 'in_progress') {
		fail(400, 'Only in-progress onboardings can be completed');
	}

	const incompleteSteps = await ctx.onboardingWorkflow.listIncompleteActiveStepIds(id);

	const updated = await persistTransition(ctx, id, { kind: 'complete', at: completedOn });

	ctx.audit.log({
		action: 'onboarding.completed',
		resourceType: 'personnel_onboarding',
		resourceId: id,
		details: { incomplete_count: incompleteSteps.length }
	});

	return {
		id: updated.id,
		status: updated.status,
		cancelledAt: updated.cancelled_at,
		completedAt: updated.completed_at,
		incompleteCount: incompleteSteps.length
	};
}
