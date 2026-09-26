import { POLICY_ACTION_CATALOG, type FeatureLanePolicyAction, type PolicyResource } from '$lib/access/policyEvaluator';
import type { DataStore, WritePorts } from '$lib/server/core/ports';
import type { PersonnelOnboardingRosterPort } from '$features/personnel/contracts';
import type { TrainingOnboardingReferencesPort } from '$features/training/contracts';
import { policyResourceForGroup, requireFeaturePolicy } from './featurePolicy';

const ONBOARDING_POLICY_ACTIONS = POLICY_ACTION_CATALOG.onboarding;
const UNSCOPED_ONBOARDING_RESOURCE: PolicyResource = { kind: 'unscoped' };

type OnboardingPolicyPorts = Pick<WritePorts, 'auth' | 'store' | 'rawStore' | 'audit'>;
export type OnboardingWorkflowPorts = WritePorts & { personnelOnboardingRoster: PersonnelOnboardingRosterPort };
export type OnboardingTrainingPorts = OnboardingWorkflowPorts & {
	trainingOnboardingReferences: TrainingOnboardingReferencesPort;
};
type OnboardingResourcePorts = OnboardingPolicyPorts & Pick<OnboardingWorkflowPorts, 'personnelOnboardingRoster'>;

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
	ports: OnboardingResourcePorts,
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
