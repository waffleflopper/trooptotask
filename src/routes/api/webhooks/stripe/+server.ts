import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
	constructWebhookEvent,
	mapStripeStatusToSubscriptionStatus,
	mapStripeBillingCycle
} from '$lib/server/stripe';
import type Stripe from 'stripe';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.text();
	const signature = request.headers.get('stripe-signature');

	if (!signature) {
		throw error(400, 'Missing Stripe signature');
	}

	// Verify webhook signature
	let event: Stripe.Event;
	try {
		event = constructWebhookEvent(body, signature, env.STRIPE_WEBHOOK_SECRET || '');
	} catch (err) {
		console.error('Webhook signature verification failed:', err);
		throw error(400, 'Invalid signature');
	}

	// Use service role client to bypass RLS (webhooks have no user session)
	const supabase = createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || '', {
		auth: { persistSession: false }
	});

	// Check if we've already processed this event (idempotency)
	const { data: existingEvent } = await supabase
		.from('stripe_webhook_events')
		.select('id, processed')
		.eq('id', event.id)
		.single();

	if (existingEvent?.processed) {
		// Already processed, return success
		return json({ received: true, status: 'already_processed' });
	}

	// Store the event for tracking
	await supabase.from('stripe_webhook_events').upsert({
		id: event.id,
		type: event.type,
		data: event.data.object,
		processed: false,
		created_at: new Date().toISOString()
	});

	try {
		// Handle different event types
		switch (event.type) {
			case 'checkout.session.completed':
				await handleCheckoutComplete(supabase, event.data.object as Stripe.Checkout.Session);
				break;

			case 'customer.subscription.created':
			case 'customer.subscription.updated':
				await handleSubscriptionUpdate(supabase, event.data.object as Stripe.Subscription);
				break;

			case 'customer.subscription.deleted':
				await handleSubscriptionDeleted(supabase, event.data.object as Stripe.Subscription);
				break;

			case 'invoice.paid':
				await handleInvoicePaid(supabase, event.data.object as Stripe.Invoice);
				break;

			case 'invoice.payment_failed':
				await handleInvoicePaymentFailed(supabase, event.data.object as Stripe.Invoice);
				break;

			default:
				console.log(`Unhandled event type: ${event.type}`);
		}

		// Mark event as processed
		await supabase
			.from('stripe_webhook_events')
			.update({
				processed: true,
				processed_at: new Date().toISOString()
			})
			.eq('id', event.id);

		return json({ received: true, status: 'processed' });
	} catch (err) {
		console.error('Error processing webhook:', err);

		// Store the error
		await supabase
			.from('stripe_webhook_events')
			.update({
				error: err instanceof Error ? err.message : 'Unknown error'
			})
			.eq('id', event.id);

		throw error(500, 'Webhook processing failed');
	}
};

// ============================================================
// Event Handlers
// ============================================================

async function handleCheckoutComplete(
	supabase: SupabaseClient,
	session: Stripe.Checkout.Session
) {
	const userId = session.metadata?.user_id;
	if (!userId) {
		console.error('Checkout session missing user_id metadata');
		return;
	}

	const customerId = session.customer as string;
	const subscriptionId = session.subscription as string;

	// Update user subscription with Stripe IDs
	await supabase
		.from('user_subscriptions')
		.update({
			stripe_customer_id: customerId,
			stripe_subscription_id: subscriptionId,
			updated_at: new Date().toISOString()
		})
		.eq('user_id', userId);
}

async function handleSubscriptionUpdate(
	supabase: SupabaseClient,
	subscription: Stripe.Subscription
) {
	const userId = subscription.metadata?.user_id;
	if (!userId) {
		console.error('Subscription missing user_id metadata');
		return;
	}

	// Get the price ID from the subscription
	const priceId = subscription.items.data[0]?.price.id;
	const interval = subscription.items.data[0]?.price.recurring?.interval;
	const intervalCount = subscription.items.data[0]?.price.recurring?.interval_count ?? 1;

	// Find the plan by price ID
	const { data: plans } = await supabase
		.from('subscription_plans')
		.select('id, stripe_price_monthly_id, stripe_price_quarterly_id, stripe_price_semiannual_id')
		.or(`stripe_price_monthly_id.eq.${priceId},stripe_price_quarterly_id.eq.${priceId},stripe_price_semiannual_id.eq.${priceId}`);

	let planId = 'free';
	if (plans && plans.length > 0) {
		planId = plans[0].id;
	}

	// Map Stripe status to our status
	const status = mapStripeStatusToSubscriptionStatus(subscription.status);
	const billingCycle = mapStripeBillingCycle(interval || 'month', intervalCount);

	// Update the subscription
	// Use type assertion since Stripe's TypeScript types may not include all properties
	const subAny = subscription as any;
	await supabase
		.from('user_subscriptions')
		.update({
			plan_id: planId,
			billing_cycle: billingCycle,
			status,
			stripe_subscription_id: subscription.id,
			current_period_start: subAny.current_period_start
				? new Date(subAny.current_period_start * 1000).toISOString()
				: null,
			current_period_end: subAny.current_period_end
				? new Date(subAny.current_period_end * 1000).toISOString()
				: null,
			trial_end: subscription.trial_end
				? new Date(subscription.trial_end * 1000).toISOString()
				: null,
			canceled_at: subscription.canceled_at
				? new Date(subscription.canceled_at * 1000).toISOString()
				: null,
			updated_at: new Date().toISOString()
		})
		.eq('user_id', userId);
}

async function handleSubscriptionDeleted(
	supabase: SupabaseClient,
	subscription: Stripe.Subscription
) {
	const userId = subscription.metadata?.user_id;
	if (!userId) {
		console.error('Subscription missing user_id metadata');
		return;
	}

	// Reset to free plan
	await supabase
		.from('user_subscriptions')
		.update({
			plan_id: 'free',
			status: 'canceled',
			stripe_subscription_id: null,
			current_period_start: null,
			current_period_end: null,
			trial_end: null,
			canceled_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		})
		.eq('user_id', userId);
}

async function handleInvoicePaid(
	supabase: SupabaseClient,
	invoice: Stripe.Invoice
) {
	// Get user ID from customer metadata or subscription
	const customerId = invoice.customer as string;

	// Find user by stripe customer ID
	const { data: subscription } = await supabase
		.from('user_subscriptions')
		.select('id, user_id')
		.eq('stripe_customer_id', customerId)
		.single();

	if (!subscription) {
		console.error('No subscription found for customer:', customerId);
		return;
	}

	// Record payment
	// Use type assertion since Stripe's TypeScript types may not include all properties
	const invoiceAny = invoice as any;
	await supabase.from('payment_history').insert({
		user_id: subscription.user_id,
		subscription_id: subscription.id,
		stripe_invoice_id: invoice.id,
		stripe_payment_intent_id: invoiceAny.payment_intent as string | null,
		amount: invoiceAny.amount_paid ?? 0,
		currency: invoice.currency,
		status: 'succeeded',
		description: invoiceAny.description || `Payment for ${invoice.lines?.data?.[0]?.description || 'subscription'}`,
		receipt_url: invoiceAny.hosted_invoice_url
	});

	// Update subscription status to active if it was past_due
	await supabase
		.from('user_subscriptions')
		.update({
			status: 'active',
			updated_at: new Date().toISOString()
		})
		.eq('user_id', subscription.user_id)
		.eq('status', 'past_due');
}

async function handleInvoicePaymentFailed(
	supabase: SupabaseClient,
	invoice: Stripe.Invoice
) {
	const customerId = invoice.customer as string;

	// Find user by stripe customer ID
	const { data: subscription } = await supabase
		.from('user_subscriptions')
		.select('id, user_id')
		.eq('stripe_customer_id', customerId)
		.single();

	if (!subscription) {
		console.error('No subscription found for customer:', customerId);
		return;
	}

	// Record failed payment
	// Use type assertion since Stripe's TypeScript types may not include all properties
	const invoiceAny = invoice as any;
	await supabase.from('payment_history').insert({
		user_id: subscription.user_id,
		subscription_id: subscription.id,
		stripe_invoice_id: invoice.id,
		stripe_payment_intent_id: invoiceAny.payment_intent as string | null,
		amount: invoiceAny.amount_due ?? 0,
		currency: invoice.currency,
		status: 'failed',
		description: `Failed payment for ${invoice.lines?.data?.[0]?.description || 'subscription'}`
	});

	// Update subscription status to past_due
	await supabase
		.from('user_subscriptions')
		.update({
			status: 'past_due',
			updated_at: new Date().toISOString()
		})
		.eq('user_id', subscription.user_id);
}
