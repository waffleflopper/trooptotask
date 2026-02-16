import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getOrCreateCustomer, createCheckoutSession, getPriceId } from '$lib/server/stripe';
import { getSubscriptionPlan, getUserSubscription } from '$lib/server/subscription';
import type { BillingCycle } from '$lib/types/subscription';
import { isBillingEnabled } from '$lib/config/billing';

export const POST: RequestHandler = async ({ request, locals, url }) => {
	if (!isBillingEnabled) {
		throw error(503, 'Billing is not enabled');
	}

	const user = locals.user;
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const body = await request.json();
	const { planId, billingCycle } = body as { planId: string; billingCycle: BillingCycle };

	if (!planId || !billingCycle) {
		throw error(400, 'Missing planId or billingCycle');
	}

	// Validate billing cycle
	if (!['monthly', 'quarterly', 'semiannual'].includes(billingCycle)) {
		throw error(400, 'Invalid billing cycle');
	}

	// Get the plan
	const plan = await getSubscriptionPlan(locals.supabase, planId);
	if (!plan) {
		throw error(400, 'Invalid plan');
	}

	// Check if it's a paid plan
	if (plan.priceMonthly === 0) {
		throw error(400, 'Cannot checkout for free plan');
	}

	// Get the price ID for this plan and cycle
	const priceId = getPriceId(plan, billingCycle);
	if (!priceId) {
		throw error(400, 'Price not configured for this plan and billing cycle');
	}

	// Get or create subscription to find existing Stripe customer
	const subData = await getUserSubscription(locals.supabase, user.id);
	const existingCustomerId = subData?.subscription.stripeCustomerId;

	// Get or create Stripe customer
	const customer = await getOrCreateCustomer(user.email!, user.id, existingCustomerId);

	// Store customer ID if we didn't have one
	if (!existingCustomerId) {
		await locals.supabase
			.from('user_subscriptions')
			.update({ stripe_customer_id: customer.id })
			.eq('user_id', user.id);
	}

	// Create checkout session
	const baseUrl = url.origin;
	const session = await createCheckoutSession({
		customerId: customer.id,
		priceId,
		userId: user.id,
		successUrl: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
		cancelUrl: `${baseUrl}/billing/canceled`
	});

	return json({
		checkoutUrl: session.url,
		sessionId: session.id
	});
};
