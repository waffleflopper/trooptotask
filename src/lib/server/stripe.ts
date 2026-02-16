import Stripe from 'stripe';
import { env } from '$env/dynamic/private';
import type { BillingCycle, SubscriptionPlan } from '../types/subscription';

// Initialize Stripe client
export const stripe = new Stripe(env.STRIPE_SECRET_KEY || '', {
	apiVersion: '2026-01-28.clover'
});

// ============================================================
// Price ID Helpers
// ============================================================

export function getPriceId(plan: SubscriptionPlan, cycle: BillingCycle): string | null {
	switch (cycle) {
		case 'monthly':
			return plan.stripePriceMonthlyId;
		case 'quarterly':
			return plan.stripePriceQuarterlyId;
		case 'semiannual':
			return plan.stripePriceSemiannualId;
	}
}

// ============================================================
// Customer Management
// ============================================================

export async function getOrCreateCustomer(
	email: string,
	userId: string,
	existingCustomerId?: string | null
): Promise<Stripe.Customer> {
	// Return existing customer if we have one
	if (existingCustomerId) {
		const customer = await stripe.customers.retrieve(existingCustomerId);
		if (!customer.deleted) {
			return customer as Stripe.Customer;
		}
	}

	// Create new customer
	const customer = await stripe.customers.create({
		email,
		metadata: {
			user_id: userId
		}
	});

	return customer;
}

// ============================================================
// Checkout Session
// ============================================================

export interface CreateCheckoutOptions {
	customerId: string;
	priceId: string;
	userId: string;
	successUrl: string;
	cancelUrl: string;
	trialDays?: number;
}

export async function createCheckoutSession(
	options: CreateCheckoutOptions
): Promise<Stripe.Checkout.Session> {
	const sessionConfig: Stripe.Checkout.SessionCreateParams = {
		customer: options.customerId,
		mode: 'subscription',
		payment_method_types: ['card'],
		line_items: [
			{
				price: options.priceId,
				quantity: 1
			}
		],
		success_url: options.successUrl,
		cancel_url: options.cancelUrl,
		subscription_data: {
			metadata: {
				user_id: options.userId
			}
		},
		metadata: {
			user_id: options.userId
		}
	};

	// Add trial period if specified
	if (options.trialDays && options.trialDays > 0) {
		sessionConfig.subscription_data!.trial_period_days = options.trialDays;
	}

	return stripe.checkout.sessions.create(sessionConfig);
}

// ============================================================
// Customer Portal
// ============================================================

export async function createPortalSession(
	customerId: string,
	returnUrl: string
): Promise<Stripe.BillingPortal.Session> {
	return stripe.billingPortal.sessions.create({
		customer: customerId,
		return_url: returnUrl
	});
}

// ============================================================
// Subscription Management
// ============================================================

export async function getSubscription(
	subscriptionId: string
): Promise<Stripe.Subscription | null> {
	try {
		return await stripe.subscriptions.retrieve(subscriptionId);
	} catch {
		return null;
	}
}

export async function cancelSubscription(
	subscriptionId: string,
	immediately: boolean = false
): Promise<Stripe.Subscription> {
	if (immediately) {
		return stripe.subscriptions.cancel(subscriptionId);
	}

	// Cancel at period end
	return stripe.subscriptions.update(subscriptionId, {
		cancel_at_period_end: true
	});
}

export async function reactivateSubscription(
	subscriptionId: string
): Promise<Stripe.Subscription> {
	return stripe.subscriptions.update(subscriptionId, {
		cancel_at_period_end: false
	});
}

// ============================================================
// Webhook Signature Verification
// ============================================================

export function constructWebhookEvent(
	payload: string | Buffer,
	signature: string,
	webhookSecret: string
): Stripe.Event {
	return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

// ============================================================
// Invoice Helpers
// ============================================================

export async function getInvoice(invoiceId: string): Promise<Stripe.Invoice | null> {
	try {
		return await stripe.invoices.retrieve(invoiceId);
	} catch {
		return null;
	}
}

// ============================================================
// Plan to Stripe Mapping
// ============================================================

export function mapStripeStatusToSubscriptionStatus(
	stripeStatus: Stripe.Subscription.Status
): 'active' | 'trialing' | 'past_due' | 'canceled' {
	switch (stripeStatus) {
		case 'active':
			return 'active';
		case 'trialing':
			return 'trialing';
		case 'past_due':
		case 'unpaid':
			return 'past_due';
		case 'canceled':
		case 'incomplete':
		case 'incomplete_expired':
		case 'paused':
		default:
			return 'canceled';
	}
}

export function mapStripeBillingCycle(
	interval: string,
	intervalCount: number
): BillingCycle {
	if (interval === 'month') {
		if (intervalCount === 1) return 'monthly';
		if (intervalCount === 3) return 'quarterly';
		if (intervalCount === 6) return 'semiannual';
	}
	// Default to monthly for unrecognized intervals
	return 'monthly';
}
