import type { RequestHandler } from './$types';
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyWebhookSignature, pauseSubscription, resumeSubscription } from '$lib/server/stripe';
import { getAdminClient } from '$lib/server/supabase';
import type { Tier } from '$lib/types/subscription';

const TIER_RANK: Record<string, number> = { free: 1, team: 2, unit: 3 };

/**
 * Stripe v20 removed `current_period_end` from the Subscription type,
 * but the webhook payload still includes it. We use this interface to
 * access the field safely via the raw event data object.
 */
interface SubscriptionWebhookData {
	current_period_end?: number;
}

/**
 * Stripe v20 moved `subscription` from the top-level Invoice into
 * `parent.subscription_details.subscription`. The webhook payload may
 * still include the legacy top-level field, so we check both paths.
 */
function getSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
	// New v20 path
	const parent = invoice.parent;
	if (parent?.subscription_details?.subscription) {
		const sub = parent.subscription_details.subscription;
		return typeof sub === 'string' ? sub : sub.id;
	}
	// Fallback: raw webhook data may still include legacy field
	const raw = invoice as unknown as Record<string, unknown>;
	if (typeof raw.subscription === 'string') return raw.subscription;
	return null;
}

/**
 * After updating an org's subscription, check if an active gift should
 * pause or resume the Stripe subscription.
 *
 * If the org has an active gift with tier >= subscription tier, pause billing.
 * Otherwise resume it.
 */
async function checkGiftPause(
	supabase: SupabaseClient,
	orgId: string,
	orgTier: string,
	subscription: Stripe.Subscription
): Promise<void> {
	const { data: org } = await supabase
		.from('organizations')
		.select('gift_tier, gift_expires_at')
		.eq('id', orgId)
		.single();

	if (!org) return;

	const giftActive = org.gift_tier && org.gift_expires_at && new Date(org.gift_expires_at) > new Date();
	const shouldPause = giftActive && (TIER_RANK[org.gift_tier] ?? 0) >= (TIER_RANK[orgTier] ?? 0);

	if (shouldPause && !subscription.pause_collection) {
		await pauseSubscription(subscription.id);
	} else if (!shouldPause && subscription.pause_collection) {
		await resumeSubscription(subscription.id);
	}
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(supabase: SupabaseClient, session: Stripe.Checkout.Session): Promise<void> {
	const orgId = session.metadata?.orgId;
	const tier = session.metadata?.tier as Tier | undefined;
	const subscriptionId = session.subscription as string | null;

	if (!orgId || !tier || !subscriptionId) {
		console.error('checkout.session.completed missing metadata', {
			orgId,
			tier,
			subscriptionId
		});
		return;
	}

	// Fetch subscription to get current_period_end
	// We import Stripe only for types; the actual SDK call goes through our helper.
	// But here we need subscription details, so use the raw event data approach:
	// The subscription object isn't fully expanded on the session, so we
	// retrieve period_end from the subscription via Stripe API.
	// However, to keep this handler simple and avoid an extra Stripe call,
	// we'll set current_period_end to null and let the subscription.updated
	// event (which Stripe always fires after checkout) fill it in.

	const { error } = await supabase
		.from('organizations')
		.update({
			stripe_customer_id: session.customer as string,
			stripe_subscription_id: subscriptionId,
			tier,
			subscription_status: 'active',
			current_period_end: null // will be set by subscription.updated
		})
		.eq('id', orgId);

	if (error) {
		throw new Error(`Failed to update org ${orgId}: ${error.message}`);
	}
}

async function handleSubscriptionUpdated(supabase: SupabaseClient, subscription: Stripe.Subscription): Promise<void> {
	const orgId = subscription.metadata?.orgId;
	const tier = (subscription.metadata?.tier ?? 'free') as Tier;

	if (!orgId) {
		console.error('customer.subscription.updated missing orgId in metadata');
		return;
	}

	const STATUS_MAP: Record<string, string | null> = {
		active: 'active',
		past_due: 'past_due',
		canceled: 'canceled',
		paused: 'active',
		trialing: 'active',
		incomplete: null,
		incomplete_expired: null,
		unpaid: 'past_due'
	};
	const status = STATUS_MAP[subscription.status];
	if (!status) return; // Don't update for incomplete/expired states

	// current_period_end was removed from Stripe SDK v20 types but is
	// still present in the webhook payload.
	const rawSub = subscription as unknown as SubscriptionWebhookData;
	const periodEnd = rawSub.current_period_end ? new Date(rawSub.current_period_end * 1000).toISOString() : null;

	const { error } = await supabase
		.from('organizations')
		.update({
			tier,
			subscription_status: status,
			current_period_end: periodEnd
		})
		.eq('id', orgId);

	if (error) {
		throw new Error(`Failed to update org ${orgId}: ${error.message}`);
	}

	// Check if a gift should pause/resume this subscription
	await checkGiftPause(supabase, orgId, tier, subscription);
}

async function handleSubscriptionDeleted(supabase: SupabaseClient, subscription: Stripe.Subscription): Promise<void> {
	const orgId = subscription.metadata?.orgId;

	if (!orgId) {
		console.error('customer.subscription.deleted missing orgId in metadata');
		return;
	}

	const { error } = await supabase
		.from('organizations')
		.update({
			tier: 'free',
			stripe_subscription_id: null,
			subscription_status: 'canceled',
			current_period_end: null
		})
		.eq('id', orgId);

	if (error) {
		throw new Error(`Failed to reset org ${orgId}: ${error.message}`);
	}
}

async function handlePaymentFailed(supabase: SupabaseClient, invoice: Stripe.Invoice): Promise<void> {
	const subscriptionId = getSubscriptionIdFromInvoice(invoice);

	if (!subscriptionId) {
		console.error('invoice.payment_failed missing subscription ID');
		return;
	}

	// Find the org by its stripe_subscription_id
	const { data: org } = await supabase
		.from('organizations')
		.select('id')
		.eq('stripe_subscription_id', subscriptionId)
		.single();

	if (!org) {
		console.error(`No org found for subscription ${subscriptionId}`);
		return;
	}

	const { error } = await supabase.from('organizations').update({ subscription_status: 'past_due' }).eq('id', org.id);

	if (error) {
		throw new Error(`Failed to mark org ${org.id} as past_due: ${error.message}`);
	}
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export const POST: RequestHandler = async ({ request }) => {
	const payload = await request.text();
	const signature = request.headers.get('stripe-signature');

	if (!signature) {
		return new Response('Missing signature', { status: 400 });
	}

	let event: Stripe.Event;
	try {
		event = verifyWebhookSignature(payload, signature);
	} catch (err) {
		console.error('Webhook signature verification failed:', err);
		return new Response('Invalid signature', { status: 400 });
	}

	// Service role client — bypasses RLS
	const supabase = getAdminClient();

	// ---- Idempotency check ----
	const { data: existing } = await supabase
		.from('stripe_webhook_events')
		.select('id, processed')
		.eq('id', event.id)
		.single();

	if (existing?.processed) {
		return new Response('Already processed', { status: 200 });
	}

	// Store the event (upsert in case of retry)
	await supabase.from('stripe_webhook_events').upsert({
		id: event.id,
		type: event.type,
		data: event.data,
		created_at: new Date(event.created * 1000).toISOString()
	});

	try {
		switch (event.type) {
			case 'checkout.session.completed':
				await handleCheckoutCompleted(supabase, event.data.object as Stripe.Checkout.Session);
				break;

			case 'customer.subscription.updated':
				await handleSubscriptionUpdated(supabase, event.data.object as Stripe.Subscription);
				break;

			case 'customer.subscription.deleted':
				await handleSubscriptionDeleted(supabase, event.data.object as Stripe.Subscription);
				break;

			case 'invoice.payment_failed':
				await handlePaymentFailed(supabase, event.data.object as Stripe.Invoice);
				break;
		}

		// Mark as processed
		await supabase
			.from('stripe_webhook_events')
			.update({
				processed: true,
				processed_at: new Date().toISOString()
			})
			.eq('id', event.id);
	} catch (err) {
		console.error(`Error processing webhook ${event.id} (${event.type}):`, err);

		await supabase
			.from('stripe_webhook_events')
			.update({
				error: err instanceof Error ? err.message : 'Unknown error'
			})
			.eq('id', event.id);

		// Return 500 so Stripe retries on infrastructure failures
		return new Response('Processing error', { status: 500 });
	}

	return new Response('OK', { status: 200 });
};
