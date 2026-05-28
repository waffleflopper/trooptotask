import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { loadSettingsShell } from './settingsShell.server';

export const load: LayoutServerLoad = async ({ locals, cookies, params, parent, route }) => {
	const parentData = await parent();
	const { orgId, orgName, orgUrlSegment, effectiveTier } = parentData;

	if (route.id === '/org/[orgId]/settings') {
		redirect(303, `/org/${orgUrlSegment ?? orgId}/settings/general`);
	}

	return loadWithContext(locals, cookies, orgId, {
		policyAction: POLICY_ACTION_CATALOG.organization.accessGovernance,
		policyResource: { kind: 'organization' },
		fn: async (ctx) => ({
			canAccessOrganizationGovernance: true,
			settingsShell: await loadSettingsShell(ctx, {
				id: orgId,
				name: orgName,
				urlSlug: orgUrlSegment && orgUrlSegment !== orgId ? orgUrlSegment : null,
				urlSegment: orgUrlSegment ?? params.orgId,
				effectiveTier: effectiveTier ?? null
			})
		})
	});
};
