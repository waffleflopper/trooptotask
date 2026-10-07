import { POLICY_ACTION_CATALOG, type FeatureLanePolicyAction, type PolicyResource } from '$lib/access/policyEvaluator';
import type { OnboardingPolicyPorts, OnboardingResourcePorts } from './onboardingPorts.server';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';

const ONBOARDING_POLICY_ACTIONS = POLICY_ACTION_CATALOG.onboarding;
const UNSCOPED_ONBOARDING_RESOURCE: PolicyResource = { kind: 'unscoped' };

export async function policyResourceForOnboardingPersonnel(
	ports: OnboardingResourcePorts,
	personnelId: string
): Promise<PolicyResource> {
	const groupIds = await ports.personnelOnboardingRoster.findGroupIds(ports.auth, [personnelId]);
	return policyResourceForGroup(groupIds.get(personnelId));
}

export async function policyResourceForOnboarding(
	ports: OnboardingResourcePorts,
	onboardingId: string
): Promise<PolicyResource> {
	const onboarding = await ports.onboardingWorkflow.findPacketReference(onboardingId);
	if (!onboarding) {
		return { kind: 'organization' };
	}
	return policyResourceForOnboardingPersonnel(ports, onboarding.personnelId);
}

export async function policyResourceForOnboardingStep(
	ports: OnboardingResourcePorts,
	stepId: string
): Promise<PolicyResource> {
	const step = await ports.onboardingWorkflow.findStepReference(stepId);
	if (!step) {
		return { kind: 'organization' };
	}
	return policyResourceForOnboarding(ports, step.onboardingId);
}

export async function requireOnboardingPolicy(
	ports: OnboardingPolicyPorts,
	action: FeatureLanePolicyAction,
	resource: PolicyResource,
	resourceId?: string
): Promise<void> {
	await requireFeaturePolicy(ports, action, resource, 'personnel_onboarding', resourceId);
}

export async function requireOnboardingViewPolicy(ports: OnboardingPolicyPorts): Promise<void> {
	await requireOnboardingPolicy(ports, ONBOARDING_POLICY_ACTIONS.viewWorkflows, UNSCOPED_ONBOARDING_RESOURCE);
}

export async function requireOnboardingManagePolicyForPersonnel(
	ports: OnboardingResourcePorts,
	personnelId: string
): Promise<void> {
	await requireOnboardingPolicy(
		ports,
		ONBOARDING_POLICY_ACTIONS.manageWorkflows,
		await policyResourceForOnboardingPersonnel(ports, personnelId)
	);
}

export async function requireOnboardingManagePolicyForOnboarding(
	ports: OnboardingResourcePorts,
	onboardingId: string
): Promise<void> {
	await requireOnboardingPolicy(
		ports,
		ONBOARDING_POLICY_ACTIONS.manageWorkflows,
		await policyResourceForOnboarding(ports, onboardingId),
		onboardingId
	);
}

export async function requireOnboardingManagePolicyForStep(
	ports: OnboardingResourcePorts,
	stepId: string
): Promise<void> {
	await requireOnboardingPolicy(
		ports,
		ONBOARDING_POLICY_ACTIONS.manageWorkflows,
		await policyResourceForOnboardingStep(ports, stepId),
		stepId
	);
}

export async function requireOnboardingConfigurePolicy(
	ports: OnboardingPolicyPorts,
	resourceId?: string
): Promise<void> {
	await requireOnboardingPolicy(
		ports,
		ONBOARDING_POLICY_ACTIONS.configureWorkflows,
		UNSCOPED_ONBOARDING_RESOURCE,
		resourceId
	);
}
