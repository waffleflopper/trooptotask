import { POLICY_ACTION_CATALOG, type PolicyResource } from '$lib/access/policyEvaluator';
import type { ClientAffordance, OrgContext } from '$lib/stores/orgContext.svelte';

export function criticalTasksPolicyResourceForGroup(groupId: string | null | undefined): PolicyResource {
	return groupId ? { kind: 'group', groupId } : { kind: 'organization' };
}

export function criticalTasksViewReadinessAffordance(org: OrgContext): ClientAffordance {
	return org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.criticalTasks.viewReadiness, { kind: 'unscoped' });
}

export function criticalTasksRecordCompletionAffordance(
	org: OrgContext,
	resource: PolicyResource = { kind: 'unscoped' }
): ClientAffordance {
	return org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.criticalTasks.recordCompletion, resource);
}

export function criticalTasksConfigureLibraryAffordance(org: OrgContext): ClientAffordance {
	return org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.criticalTasks.configureLibrary);
}
