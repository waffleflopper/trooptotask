/**
 * Onboarding resync use case — reconciles step progress rows when a template is edited.
 *
 * When steps are added/removed from an onboarding template after active onboarding records
 * exist, `resyncOnboarding(ctx, onboardingId)` adds missing step rows and retains
 * removed steps as inactive history, preserving completion and attributed notes.
 *
 * SQL locks the packet and reconciles its saved progress in one transaction.
 */
import type { OnboardingReconciliationPort, OnboardingReconciliationStepRow } from '../contracts';
import type { OnboardingReconciliationPorts } from './onboardingPorts.server';
import {
	requireOnboardingConfigurePolicy,
	requireOnboardingManagePolicyForOnboarding
} from './onboardingPolicy.server';

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
	progressChangedAt: string;
}

interface ResyncResult {
	onboardingId: string;
	templateId: string;
	steps: ResyncStepResult[];
}

function mapToResult(row: OnboardingReconciliationStepRow): ResyncStepResult {
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
		active: row.active,
		progressChangedAt: row.progress_changed_at
	};
}

function reconciliationPort(ctx: OnboardingReconciliationPorts): OnboardingReconciliationPort {
	if (!ctx.onboardingReconciliation) {
		throw new Error('Bind the owned Onboarding reconciliation provider');
	}
	return ctx.onboardingReconciliation;
}

export async function resyncOnboarding(
	ctx: OnboardingReconciliationPorts,
	onboardingId: string
): Promise<ResyncResult> {
	await requireOnboardingConfigurePolicy(ctx, onboardingId);
	await requireOnboardingManagePolicyForOnboarding(ctx, onboardingId);

	const result = await reconciliationPort(ctx).reconcile(ctx.auth.orgId, onboardingId, null);
	ctx.audit.log({
		action: 'onboarding.resynced',
		resourceType: 'personnel_onboarding',
		resourceId: result.onboarding_id,
		details: { templateId: result.template_id }
	});

	return {
		onboardingId: result.onboarding_id,
		templateId: result.template_id,
		steps: result.steps.map(mapToResult)
	};
}

interface SwitchTemplateInput {
	onboardingId: string;
	newTemplateId: string;
}

export async function switchTemplate(
	ctx: OnboardingReconciliationPorts,
	input: SwitchTemplateInput
): Promise<ResyncResult> {
	await requireOnboardingConfigurePolicy(ctx, input.onboardingId);
	await requireOnboardingManagePolicyForOnboarding(ctx, input.onboardingId);

	const result = await reconciliationPort(ctx).reconcile(ctx.auth.orgId, input.onboardingId, input.newTemplateId);
	ctx.audit.log({
		action: 'onboarding.template_switched',
		resourceType: 'personnel_onboarding',
		resourceId: result.onboarding_id,
		details: { oldTemplateId: result.old_template_id, newTemplateId: result.template_id }
	});

	return {
		onboardingId: result.onboarding_id,
		templateId: result.template_id,
		steps: result.steps.map(mapToResult)
	};
}
