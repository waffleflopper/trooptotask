import type { OnboardingReconciliationPort } from '../contracts';
import type { OnboardingResourcePorts } from './onboardingPorts.server';

export interface OnboardingReconciliationPorts extends OnboardingResourcePorts {
	readonly audit: NonNullable<OnboardingResourcePorts['audit']>;
	readonly onboardingReconciliation?: OnboardingReconciliationPort;
}
