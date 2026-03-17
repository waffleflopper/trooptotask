import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isBillingEnabled } from '$lib/config/billing';
import { TIER_CONFIG, type Tier } from '$lib/types/subscription';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const { orgId, userRole, effectiveTier } = await parent();

	// Billing page only accessible to org owners
	if (userRole !== 'owner') {
		throw error(403, 'Only the organization owner can manage billing');
	}

	// If billing is disabled, redirect to settings — there's nothing to manage
	if (!isBillingEnabled) {
		throw redirect(303, `/org/${orgId}/settings`);
	}

	// Fetch org details for Stripe customer ID
	const { data: org } = await locals.supabase
		.from('organizations')
		.select('id, name, stripe_customer_id, subscription_status, stripe_subscription_id')
		.eq('id', orgId)
		.single();

	if (!org) {
		throw error(404, 'Organization not found');
	}

	const canManageSubscription = !!(
		org.stripe_customer_id &&
		org.subscription_status &&
		['active', 'past_due', 'paused'].includes(org.subscription_status)
	);

	// Build tier comparison data (safe for serialization — handle Infinity)
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
		stripeCustomerId: org.stripe_customer_id as string | null,
		subscriptionStripeId: org.stripe_subscription_id as string | null,
		canManageSubscription,
		tierComparison
	};
};
