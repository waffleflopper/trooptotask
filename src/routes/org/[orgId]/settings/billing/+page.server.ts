import type { PageServerLoad } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import type { UseCaseContext } from '$lib/server/core/ports';
import { readEffectivePlanPolicy } from '$lib/server/core/useCases/planPolicy';
import { readOrganizationPlanUsage } from '$lib/server/core/useCases/organizationPlanUsage';
import { buildPlanUsageSummary, type PlanUsageSummary } from '$lib/server/core/useCases/planUsageSummary';
import { buildGeneralSettingsData } from '../settingsGeneral.server';
export { actions } from '../general/+page.server';

export const load: PageServerLoad = async ({ locals, cookies, parent }) => {
	const parentData = await parent();
	const { orgId, orgName, orgUrlSegment, allOrgs, isAdmin, effectiveTier } = parentData;
	const permissions = parentData.permissions!;

	return loadWithContext(locals, cookies, orgId, {
		policyAction: POLICY_ACTION_CATALOG.organization.accessGovernance,
		policyResource: { kind: 'organization' },
		fn: async (ctx) => {
			const planUsageSummary = await loadPlanUsageSummary(ctx);

			return {
				orgId,
				orgUrlSegment: orgUrlSegment ?? orgId,
				orgUrlSlug: orgUrlSegment && orgUrlSegment !== orgId ? orgUrlSegment : null,
				orgName,
				effectiveTier,
				permissions,
				allOrgs,
				planUsageSummary,
				generalSettings: buildGeneralSettingsData(ctx, {
					isAdmin: Boolean(isAdmin),
					organization: {
						id: orgId,
						name: orgName,
						urlSlug: orgUrlSegment && orgUrlSegment !== orgId ? orgUrlSegment : null,
						urlSegment: orgUrlSegment ?? orgId,
						effectiveTier: effectiveTier ?? null
					}
				})
			};
		}
	});
};

async function loadPlanUsageSummary(ctx: Pick<UseCaseContext, 'auth' | 'rawStore'>): Promise<PlanUsageSummary> {
	const [policy, usage] = await Promise.all([
		readEffectivePlanPolicy({ auth: ctx.auth, store: ctx.rawStore }),
		readOrganizationPlanUsage({ auth: ctx.auth, store: ctx.rawStore })
	]);
	return buildPlanUsageSummary(policy, usage);
}
