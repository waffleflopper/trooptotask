import { POLICY_ACTION_CATALOG, type FeatureLanePolicyAction, type PolicyResource } from '$lib/access/policyEvaluator';
import type { DataStore, WritePorts } from '$lib/server/core/ports';
import { policyResourceForPersonnel, requireFeaturePolicy } from './featurePolicy';

const ONBOARDING_POLICY_ACTIONS = POLICY_ACTION_CATALOG.onboarding;
const UNSCOPED_ONBOARDING_RESOURCE: PolicyResource = { kind: 'unscoped' };

type OnboardingPolicyPorts = Pick<WritePorts, 'auth' | 'store' | 'rawStore' | 'audit'>;

interface PersonnelBackedRow {
	personnel_id: string;
}

interface StepBackedRow {
	onboarding_id: string;
}

function policyLookupStore(ports: OnboardingPolicyPorts): DataStore {
	return ports.rawStore ?? ports.store;
}

export async function policyResourceForOnboardingPersonnel(
	ports: OnboardingPolicyPorts,
	personnelId: string
): Promise<PolicyResource> {
	return policyResourceForPersonnel({ store: policyLookupStore(ports), auth: ports.auth }, personnelId);
}

export async function policyResourceForOnboarding(
	ports: OnboardingPolicyPorts,
	onboardingId: string
): Promise<PolicyResource> {
	const onboarding = await policyLookupStore(ports).findOne<PersonnelBackedRow>(
		'personnel_onboardings',
		ports.auth.orgId,
		{ id: onboardingId },
		'personnel_id'
	);
	if (!onboarding) {
		return { kind: 'organization' };
	}
	return policyResourceForOnboardingPersonnel(ports, onboarding.personnel_id);
}

export async function policyResourceForOnboardingStep(
	ports: OnboardingPolicyPorts,
	stepId: string
): Promise<PolicyResource> {
	const step = await policyLookupStore(ports).findOne<StepBackedRow>(
		'onboarding_step_progress',
		ports.auth.orgId,
		{ id: stepId },
		'onboarding_id'
	);
	if (!step) {
		return { kind: 'organization' };
	}
	return policyResourceForOnboarding(ports, step.onboarding_id);
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
	ports: OnboardingPolicyPorts,
	personnelId: string
): Promise<void> {
	await requireOnboardingPolicy(
		ports,
		ONBOARDING_POLICY_ACTIONS.manageWorkflows,
		await policyResourceForOnboardingPersonnel(ports, personnelId)
	);
}

export async function requireOnboardingManagePolicyForOnboarding(
	ports: OnboardingPolicyPorts,
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
	ports: OnboardingPolicyPorts,
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
