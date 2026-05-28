import type { PageServerLoad } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { loadPoliciesSettings } from '../settingsPolicies.server';

export const load: PageServerLoad = async ({ locals, cookies, parent }) => {
	const parentData = await parent();
	const { orgId, orgName, orgUrlSegment, allOrgs, isAdmin, effectiveTier } = parentData;
	const permissions = parentData.permissions!;

	return loadWithContext(locals, cookies, orgId, {
		policyAction: POLICY_ACTION_CATALOG.organization.accessGovernance,
		policyResource: { kind: 'organization' },
		fn: async (ctx) => ({
			orgId,
			orgUrlSegment: orgUrlSegment ?? orgId,
			orgUrlSlug: orgUrlSegment && orgUrlSegment !== orgId ? orgUrlSegment : null,
			orgName,
			effectiveTier,
			permissions,
			allOrgs,
			policiesSettings: await loadPoliciesSettings(ctx, { isAdmin: Boolean(isAdmin) })
		})
	});
};
