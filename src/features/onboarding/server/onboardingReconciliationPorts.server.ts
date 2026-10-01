import type { OnboardingResourcePorts } from './onboardingPorts.server';

/** Saved progress returned by the atomic packet reconciliation, including inactive history. */
export interface OnboardingReconciliationStepRow {
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

export interface OnboardingReconciliationResult {
	onboarding_id: string;
	template_id: string;
	old_template_id: string | null;
	steps: OnboardingReconciliationStepRow[];
}

export interface OnboardingReconciliationPort {
	/** Null selects the packet's current template while holding its database lock. */
	reconcile(
		organizationId: string,
		onboardingId: string,
		newTemplateId: string | null
	): Promise<OnboardingReconciliationResult>;
}

export interface OnboardingReconciliationPorts extends OnboardingResourcePorts {
	readonly audit: NonNullable<OnboardingResourcePorts['audit']>;
	readonly onboardingReconciliation?: OnboardingReconciliationPort;
}
