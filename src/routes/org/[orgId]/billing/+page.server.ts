import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { isBillingEnabled } from '$lib/config/billing';
import { TIER_CONFIG, type Tier } from '$lib/types/subscription';

export const load: PageServerLoad = async ({ params, locals, cookies, parent }) => {
	const { orgId } = params;
	const parentData = await parent();

	// If billing is disabled, redirect to settings — there's nothing to manage
	if (!isBillingEnabled) {
		throw redirect(303, `/org/${orgId}/settings`);
	}

	return loadWithContext(locals, cookies, orgId, {
		permission: 'owner',
		fn: async (ctx) => {
			const effectiveTier = parentData.effectiveTier!;
			const org = await ctx.store.findOne<Record<string, unknown>>('organizations', ctx.auth.orgId, {
				id: ctx.auth.orgId
			});

			if (!org) {
				throw error(404, 'Organization not found');
			}

			const canManageSubscription = !!(
				org.stripe_customer_id &&
				org.subscription_status &&
				['active', 'past_due', 'paused'].includes(org.subscription_status as string)
			);

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
				orgName: org.name as string,
				stripeCustomerId: (org.stripe_customer_id as string | null) ?? null,
				subscriptionStripeId: (org.stripe_subscription_id as string | null) ?? null,
				canManageSubscription,
				tierComparison
			};
		}
	});
};
