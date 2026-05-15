import { createOrgContext, type CreateOrgContextInput, type OrgContext } from '$lib/stores/orgContext.svelte';
export type { CreateOrgContextInput } from '$lib/stores/orgContext.svelte';
import { capabilityMeets, type CapabilityMap } from '$lib/access/memberAccessShape';
import type { OrganizationMemberPermissions } from '$lib/types';

export const FULL_TEST_CAPABILITY_MAP: CapabilityMap = {
	calendar: 'configure',
	personnel: 'configure',
	training: 'configure',
	criticalTasks: 'configure',
	onboarding: 'configure',
	ratingScheme: 'configure'
};

export const VIEW_TEST_CAPABILITY_MAP: CapabilityMap = {
	calendar: 'view',
	personnel: 'view',
	training: 'view',
	criticalTasks: 'view',
	onboarding: 'view',
	ratingScheme: 'view'
};

export const NONE_TEST_CAPABILITY_MAP: CapabilityMap = {
	calendar: 'none',
	personnel: 'none',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'none',
	ratingScheme: 'none'
};

function deriveTestPermissions(
	capabilityMap: CapabilityMap,
	role: 'owner' | 'admin' | 'member'
): OrganizationMemberPermissions {
	return {
		canViewCalendar: capabilityMeets(capabilityMap.calendar, 'view'),
		canEditCalendar: capabilityMeets(capabilityMap.calendar, 'operate'),
		canViewPersonnel: capabilityMeets(capabilityMap.personnel, 'view'),
		canEditPersonnel: capabilityMeets(capabilityMap.personnel, 'operate'),
		canViewTraining: capabilityMeets(capabilityMap.training, 'view'),
		canEditTraining: capabilityMeets(capabilityMap.training, 'operate'),
		canViewCriticalTasks: capabilityMeets(capabilityMap.criticalTasks, 'view'),
		canEditCriticalTasks: capabilityMeets(capabilityMap.criticalTasks, 'operate'),
		canViewOnboarding: capabilityMeets(capabilityMap.onboarding, 'view'),
		canEditOnboarding: capabilityMeets(capabilityMap.onboarding, 'operate'),
		canViewRatingScheme: capabilityMeets(capabilityMap.ratingScheme, 'view'),
		canEditRatingScheme: capabilityMeets(capabilityMap.ratingScheme, 'operate'),
		canManageMembers: role === 'owner' || role === 'admin'
	};
}

/**
 * Shared OrgContext builder for client-side tests. Defaults to owner with
 * full configure access on all lanes and organization-wide scope.
 *
 * Permissions are auto-derived from the capability map so tests never need
 * to maintain both in sync.
 */
export function createTestOrgContext(overrides?: Partial<CreateOrgContextInput>): OrgContext {
	const capabilityMap = overrides?.capabilityMap ?? FULL_TEST_CAPABILITY_MAP;
	const userRole = overrides?.userRole ?? 'owner';
	return createOrgContext({
		orgId: 'test-org',
		orgName: 'Test Org',
		userId: 'test-user',
		userRole,
		capabilityMap,
		scopeSet: { kind: 'organization' },
		permissions: deriveTestPermissions(capabilityMap, userRole),
		scopedGroupId: null,
		isReadOnly: false,
		...overrides
	});
}
