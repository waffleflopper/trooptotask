import type { LayoutServerLoad } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';

export const load: LayoutServerLoad = async ({ locals, cookies, params }) => {
	return loadWithContext(locals, cookies, params.orgId, {
		policyAction: POLICY_ACTION_CATALOG.organization.accessGovernance,
		policyResource: { kind: 'organization' },
		fn: async () => ({
			canAccessOrganizationGovernance: true
		})
	});
};
