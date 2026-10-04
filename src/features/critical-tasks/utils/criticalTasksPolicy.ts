import { POLICY_ACTION_CATALOG, type PolicyResource } from '$lib/access/policyEvaluator';
import type { CriticalTasksAffordance, CriticalTasksPageAccess } from '../contracts';

export function criticalTasksPolicyResourceForGroup(groupId: string | null | undefined): PolicyResource {
	return groupId ? { kind: 'group', groupId } : { kind: 'organization' };
}

export function criticalTasksViewReadinessAffordance(org: CriticalTasksPageAccess): CriticalTasksAffordance {
	return org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.criticalTasks.viewReadiness, { kind: 'unscoped' });
}

export function criticalTasksRecordCompletionAffordance(
	org: CriticalTasksPageAccess,
	resource: PolicyResource = { kind: 'unscoped' }
): CriticalTasksAffordance {
	return org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.criticalTasks.recordCompletion, resource);
}

export function criticalTasksConfigureLibraryAffordance(org: CriticalTasksPageAccess): CriticalTasksAffordance {
	return org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.criticalTasks.configureLibrary);
}
