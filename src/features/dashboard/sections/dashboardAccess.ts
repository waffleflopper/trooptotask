import type { ClientAccess } from '$lib/access/clientAccess';
import type { FeatureLanePolicyAction, PolicyResource } from '$lib/access/policyEvaluator';
import { scopeSetResourceForGroupId } from '$lib/access/scopeSetAccess';

export interface DashboardAccess {
	/** Advisory permission to act on the resource, or somewhere within the viewer's scope when none is given. */
	readonly can: (action: FeatureLanePolicyAction, resource?: PolicyResource) => boolean;
}

export function createDashboardAccess(policy: Pick<ClientAccess, 'affordanceForFeatureAction'>): DashboardAccess {
	return {
		can: (action, resource = { kind: 'unscoped' }) => policy.affordanceForFeatureAction(action, resource).allowed
	};
}

export function personnelResource(person: { readonly groupId?: string | null }): PolicyResource {
	return scopeSetResourceForGroupId(person.groupId);
}

export function actionablePersonnel<P extends { readonly groupId?: string | null }>(
	personnel: readonly P[],
	access: DashboardAccess,
	action: FeatureLanePolicyAction
): P[] {
	return personnel.filter((person) => access.can(action, personnelResource(person)));
}
