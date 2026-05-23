import type { PageServerLoad } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { TIER_CONFIG, type EffectiveTier, type Tier } from '$lib/types/subscription';
import { canManageBillingSubscription, readBillingOrganization } from '$lib/server/core/useCases/billingOrganization';
import type { UseCaseContext } from '$lib/server/core/ports';
import { requireGovernancePolicy } from '$lib/server/core/useCases/governancePolicy';
import { readCurrentBillingSnapshot, summarizeBillingCancellation } from '$lib/server/core/useCases/billingState';

export async function _loadBillingPageData(
	ctx: Pick<UseCaseContext, 'auth' | 'audit' | 'rawStore'>,
	effectiveTier: EffectiveTier
) {
	await requireGovernancePolicy({ auth: ctx.auth, audit: ctx.audit }, POLICY_ACTION_CATALOG.organization.accessBilling);

	const org = await readBillingOrganization({ auth: ctx.auth, store: ctx.rawStore });
	const billingSnapshot = await readCurrentBillingSnapshot({ auth: ctx.auth, store: ctx.rawStore });
	const canManageSubscription = canManageBillingSubscription(org);

	const tierComparison = (['free', 'team', 'unit'] as Tier[]).map((tier) => {
		const config = TIER_CONFIG[tier];
		return {
			tier,
			name: config.name,
			personnelCap: config.personnelCap === Infinity ? null : config.personnelCap,
			maxOrgsOwned: config.maxOrgsOwned === Infinity ? null : config.maxOrgsOwned,
			bulkExportsPerMonth: config.bulkExportsPerMonth === Infinity ? null : config.bulkExportsPerMonth,
			priceMonthly: config.priceMonthly
		};
	});

	return {
		effectiveTier,
		orgName: org.name,
		stripeCustomerId: org.stripeCustomerId,
		subscriptionStripeId: org.stripeSubscriptionId,
		billingSnapshot,
		cancellationSummary: summarizeBillingCancellation(billingSnapshot),
		canManageSubscription,
		tierComparison
	};
}

export const load: PageServerLoad = async ({ params, locals, cookies, parent }) => {
	const { orgId } = params;
	const parentData = await parent();

	return loadWithContext(locals, cookies, orgId, {
		permission: 'owner',
		fn: async (ctx) => _loadBillingPageData(ctx, parentData.effectiveTier!)
	});
};
