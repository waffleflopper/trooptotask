import { createOrgContext, type CreateOrgContextInput, type OrgContext } from '$lib/stores/orgContext.svelte';
export type { CreateOrgContextInput } from '$lib/stores/orgContext.svelte';
import type { CapabilityMap } from '$lib/access/memberAccessShape';

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

/**
 * Shared OrgContext builder for client-side tests. Defaults to owner with
 * full configure access on all lanes and organization-wide scope.
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
		...overrides
	});
}
