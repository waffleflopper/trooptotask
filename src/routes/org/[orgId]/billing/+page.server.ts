import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { isBillingEnabled } from '$lib/config/billing';
import { TIER_CONFIG, type EffectiveTier, type Tier } from '$lib/types/subscription';
import { canManageBillingSubscription, readBillingOrganization } from '$lib/server/core/useCases/billingOrganization';
import type { UseCaseContext } from '$lib/server/core/ports';

export async function loadBillingPageData(
	ctx: Pick<UseCaseContext, 'auth' | 'rawStore'>,
	effectiveTier: EffectiveTier
) {
	const org = await readBillingOrganization({ auth: ctx.auth, store: ctx.rawStore });
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
		canManageSubscription,
		tierComparison
	};
}

export const load: PageServerLoad = async ({ params, locals, cookies, parent }) => {
	const { orgId } = params;
	const parentData = await parent();

	// If billing is disabled, redirect to settings — there's nothing to manage
	if (!isBillingEnabled) {
		throw redirect(303, `/org/${orgId}/settings`);
	}

	return loadWithContext(locals, cookies, orgId, {
		permission: 'owner',
		fn: async (ctx) => loadBillingPageData(ctx, parentData.effectiveTier!)
	});
};
