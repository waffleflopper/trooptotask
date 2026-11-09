/**
 * Lifecycle transitions require the expected saved status at the parent mutation.
 */
import { fail, RequestFailure } from '$lib/errors';
import type { OnboardingTrainingPorts, OnboardingLifecyclePorts } from './onboardingPorts.server';
import {
	START_ONBOARDING_BATCH_LIMIT,
	type OnboardingLifecycleTransition,
	type StartOnboardingBatchResult,
	type StartOnboardingOutcome
} from '../contracts';
import { formatToday, isDateOnly } from '$lib/utils/dates';
import { isUuid } from '$lib/utils/inputSchemas';
import {
	requireOnboardingManagePolicyForOnboarding,
	requireOnboardingManagePolicyForPersonnelList
} from './onboardingPolicy.server';
import type { PersonnelOnboarding } from '../onboarding.types';
import { onboardingResponse } from './manualTrainingSteps.server';

interface StartBatchInput {
	personnelIds: readonly string[];
	templateId: string;
	startedAt?: string;
}

/** Each person's packet is saved in its own transaction, a few at a time. */
const START_CONCURRENCY = 8;

function startFailureMessage(error: unknown): string {
	return error instanceof RequestFailure && error.status < 500
		? error.message
		: 'Onboarding could not be started for this person.';
}

function admitPersonnelIds(personnelIds: readonly unknown[]): string[] {
	if (!Array.isArray(personnelIds) || personnelIds.length === 0) fail(400, 'Choose at least one Person to onboard');
	if (!personnelIds.every(isUuid)) fail(400, 'Choose a Person to onboard');
	const unique = [...new Set<string>(personnelIds)];
	if (unique.length > START_ONBOARDING_BATCH_LIMIT) {
		fail(400, `Start onboarding for at most ${START_ONBOARDING_BATCH_LIMIT} people at a time`);
	}
	return unique;
}

/**
 * Starts the same template for several people. The template is read once and Training is asked once.
 * Anyone the requester may not manage rejects the whole request before anything is saved.
 * After that, one person's failure is reported on that person and does not undo the others.
 */
export async function startOnboardingBatch(
	ctx: OnboardingTrainingPorts,
	input: StartBatchInput
): Promise<StartOnboardingBatchResult> {
	const personnelIds = admitPersonnelIds(input.personnelIds);
	await requireOnboardingManagePolicyForPersonnelList(ctx, personnelIds);

	if (!isUuid(input.templateId)) fail(400, 'A configured onboarding template is required');
	const startedAt = resolveStartedAt(input.startedAt);
	if (!ctx.onboardingPacketCreation) throw new Error('Bind the owned Onboarding packet creation provider');
	if (!(await ctx.onboardingCatalog.findTemplate(input.templateId))) fail(404, 'Onboarding template not found');
	const packetCreation = ctx.onboardingPacketCreation;

	// The creation transaction also enforces one active packet per person, for starts that overlap this check.
	const alreadyOnboarding = new Set(await ctx.onboardingWorkflow.listActivePacketPersonnelIds());
	const toStart = personnelIds.filter((personnelId) => !alreadyOnboarding.has(personnelId));
	const outcomes = new Map<string, StartOnboardingOutcome>(
		personnelIds
			.filter((personnelId) => alreadyOnboarding.has(personnelId))
			.map((personnelId) => [personnelId, { personnelId, outcome: 'already_onboarding' }])
	);

	if (toStart.length > 0) {
		const templateSteps = await ctx.onboardingCatalog.listSteps(input.templateId);
		const trainingTypeIds = templateSteps
			.filter((step) => step.stepType === 'training' && step.trainingTypeId)
			.map((step) => step.trainingTypeId!);
		const completedTrainingTypeIds =
			trainingTypeIds.length > 0
				? await ctx.trainingOnboardingReferences.completedTypeIds(ctx, toStart, trainingTypeIds)
				: new Map<string, Set<string>>();

		const start = async (personnelId: string): Promise<StartOnboardingOutcome> => {
			const completed = completedTrainingTypeIds.get(personnelId) ?? new Set<string>();
			try {
				const { onboarding, steps } = await packetCreation.create(ctx.auth.orgId, {
					personnelId,
					templateId: input.templateId,
					startedAt,
					steps: templateSteps.map((step) => ({
						template_step_id: step.id,
						step_name: step.name,
						step_type: step.stepType,
						training_type_id: step.trainingTypeId,
						stages: step.stages,
						sort_order: step.sortOrder,
						completed: step.stepType === 'training' && step.trainingTypeId ? completed.has(step.trainingTypeId) : false
					}))
				});
				return {
					personnelId,
					outcome: 'started',
					onboarding: onboardingResponse(ctx, {
						id: onboarding.id,
						personnelId: onboarding.personnel_id,
						templateId: onboarding.template_id,
						status: onboarding.status,
						startedAt: onboarding.started_at,
						completedAt: onboarding.completed_at,
						cancelledAt: onboarding.cancelled_at,
						steps: steps.map((step) => ({
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
						}))
						// Database CHECK constraints bound status and step_type to the contract's unions.
					}) as PersonnelOnboarding
				};
			} catch (error) {
				if (error instanceof RequestFailure && error.status === 409)
					return { personnelId, outcome: 'already_onboarding' };
				return { personnelId, outcome: 'failed', message: startFailureMessage(error) };
			}
		};

		for (let from = 0; from < toStart.length; from += START_CONCURRENCY) {
			const chunk = toStart.slice(from, from + START_CONCURRENCY);
			for (const outcome of await Promise.all(chunk.map(start))) outcomes.set(outcome.personnelId, outcome);
		}
	}

	return { results: personnelIds.map((personnelId) => outcomes.get(personnelId)!) };
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

	return {
		id: updated.id,
		status: updated.status,
		cancelledAt: updated.cancelled_at,
		completedAt: updated.completed_at,
		incompleteCount: incompleteSteps.length
	};
}
