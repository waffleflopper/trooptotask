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
	// Redirect to dashboard if billing is disabled
	if (!isBillingEnabled) {
		throw redirect(303, '/dashboard');
	}

	const { user } = await locals.safeGetSession();
	if (!user) throw redirect(303, '/auth/login');

	// Get subscription with plan
	const { subscription, plan } = await ensureUserSubscription(locals.supabase, user.id);

	// Get organization count
	const organizationCount = await countUserOrganizations(locals.supabase, user.id);

	// Compute limits
	const limits = computeSubscriptionLimits(subscription, plan, organizationCount);

	// Get all plans for comparison
	const allPlans = await getSubscriptionPlans(locals.supabase);

	// Get recent payment history
	const { data: payments } = await locals.supabase
		.from('payment_history')
		.select('*')
		.eq('user_id', user.id)
		.order('created_at', { ascending: false })
		.limit(10);

	const paymentHistory = (payments ?? []).map((p) => ({
		id: p.id,
		amount: p.amount,
		currency: p.currency,
		status: p.status,
		description: p.description,
		receiptUrl: p.receipt_url,
		createdAt: p.created_at
	}));

	return {
		subscription: {
			id: subscription.id,
			planId: subscription.planId,
			billingCycle: subscription.billingCycle,
			status: subscription.status,
			currentPeriodEnd: subscription.currentPeriodEnd,
			trialEnd: subscription.trialEnd,
			canceledAt: subscription.canceledAt,
			hasStripeSubscription: !!subscription.stripeSubscriptionId
		},
		plan: {
			id: plan.id,
			name: plan.name,
			description: plan.description,
			priceMonthly: plan.priceMonthly,
			priceQuarterly: plan.priceQuarterly,
			priceSemiannual: plan.priceSemiannual
		},
		limits,
		allPlans,
		paymentHistory
	};
};
