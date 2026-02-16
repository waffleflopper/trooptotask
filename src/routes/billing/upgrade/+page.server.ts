import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	ensureUserSubscription,
	getSubscriptionPlans,
	countUserOrganizations,
	computeSubscriptionLimits
} from '$lib/server/subscription';
import { isBillingEnabled } from '$lib/config/billing';

export const load: PageServerLoad = async ({ locals }) => {
	if (!isBillingEnabled) {
		throw redirect(303, '/dashboard');
	}

	const { user } = await locals.safeGetSession();
	if (!user) throw redirect(303, '/auth/login');

	// Get subscription with plan
	const { subscription, plan } = await ensureUserSubscription(locals.supabase, user.id);

	// Get organization count
	const organizationCount = await countUserOrganizations(locals.supabase, user.id);

	// Get all plans for comparison
	const allPlans = await getSubscriptionPlans(locals.supabase);

	return {
		currentPlanId: subscription.planId,
		currentBillingCycle: subscription.billingCycle,
		hasStripeSubscription: !!subscription.stripeSubscriptionId,
		organizationCount,
		plans: allPlans
	};
};
