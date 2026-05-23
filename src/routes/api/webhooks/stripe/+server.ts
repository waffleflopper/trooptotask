import type { RequestHandler } from './$types';
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyWebhookSignature, pauseSubscription, resumeSubscription } from '$lib/server/stripe';
import { getAdminClient } from '$lib/server/supabase';
import { invalidateTierCache } from '$lib/server/subscription';
import type { Tier } from '$lib/types/subscription';

const TIER_RANK: Record<string, number> = { free: 1, team: 2, unit: 3 };
const FINAL_PROCESSING_STATES = new Set(['processed', 'ignored', 'permanently_failed', 'superseded']);

type WebhookProcessingState = 'processed' | 'ignored' | 'retryable_failed' | 'permanently_failed' | 'superseded';

interface ExistingWebhookEvent {
	id: string;
	processed?: boolean;
	processing_state?: WebhookProcessingState | null;
	attempt_count?: number | null;
}

interface WebhookProcessingResult {
	state: Exclude<WebhookProcessingState, 'retryable_failed'>;
	result: string;
}

interface SubscriptionUpdateResult {
	state: 'processed' | 'ignored';
	result: string;
}

class PermanentWebhookProcessingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PermanentWebhookProcessingError';
	}
}

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

function getStripeObjectId(object: unknown): string | null {
	if (!object || typeof object !== 'object') return null;
	const id = (object as { id?: unknown }).id;
	return typeof id === 'string' && id.length > 0 ? id : null;
}

function buildSecondaryDedupeKey(event: Stripe.Event): string {
	const objectId = getStripeObjectId(event.data.object);
	return objectId ? `${event.type}:${objectId}` : `${event.type}:${event.id}`;
}

function sanitizeWebhookError(err: unknown): string {
	const message = err instanceof Error ? err.message : 'Unknown webhook processing error';
	return message
		.replace(/sk_(live|test)_[A-Za-z0-9_]+/g, '[redacted_stripe_key]')
		.replace(/whsec_\S+/g, '[redacted_webhook_secret]')
		.replace(/stripe-signature[:=]\s*\S+/gi, 'stripe-signature=[redacted]');
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

async function handleCheckoutCompleted(supabase: SupabaseClient, session: Stripe.Checkout.Session): Promise<string> {
	const orgId = session.metadata?.orgId;
	const tier = session.metadata?.tier as Tier | undefined;
	const subscriptionId = session.subscription as string | null;

	if (!orgId || !tier || !subscriptionId) {
		throw new PermanentWebhookProcessingError('checkout.session.completed missing orgId, tier, or subscriptionId');
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

	invalidateTierCache(orgId);
	return `checkout completed for organization ${orgId}`;
}

async function handleSubscriptionUpdated(
	supabase: SupabaseClient,
	subscription: Stripe.Subscription
): Promise<SubscriptionUpdateResult> {
	const orgId = subscription.metadata?.orgId;
	const tier = (subscription.metadata?.tier ?? 'free') as Tier;

	if (!orgId) {
		throw new PermanentWebhookProcessingError('customer.subscription.updated missing orgId metadata');
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
	if (!status) {
		return {
			state: 'ignored',
			result: `subscription status ${subscription.status} is not mapped to local billing access`
		};
	}

	// current_period_end was removed from Stripe SDK v20 types but is
	// still present in the webhook payload.
	const rawSub = subscription as unknown as SubscriptionWebhookData;
	const periodEnd = rawSub.current_period_end ? new Date(rawSub.current_period_end * 1000).toISOString() : null;

	const { error } = await supabase
		.from('organizations')
		.update({
			tier,
			stripe_subscription_id: subscription.id,
			subscription_status: status,
			current_period_end: periodEnd
		})
		.eq('id', orgId);

	if (error) {
		throw new Error(`Failed to update org ${orgId}: ${error.message}`);
	}

	invalidateTierCache(orgId);

	// Check if a gift should pause/resume this subscription
	await checkGiftPause(supabase, orgId, tier, subscription);
	return {
		state: 'processed',
		result: `subscription updated for organization ${orgId}`
	};
}

async function handleSubscriptionDeleted(supabase: SupabaseClient, subscription: Stripe.Subscription): Promise<string> {
	const orgId = subscription.metadata?.orgId;

	if (!orgId) {
		throw new PermanentWebhookProcessingError('customer.subscription.deleted missing orgId metadata');
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

	invalidateTierCache(orgId);
	return `subscription deleted for organization ${orgId}`;
}

async function handlePaymentFailed(supabase: SupabaseClient, invoice: Stripe.Invoice): Promise<string> {
	const subscriptionId = getSubscriptionIdFromInvoice(invoice);

	if (!subscriptionId) {
		throw new PermanentWebhookProcessingError('invoice.payment_failed missing subscription ID');
	}

	// Find the org by its stripe_subscription_id
	const { data: org } = await supabase
		.from('organizations')
		.select('id')
		.eq('stripe_subscription_id', subscriptionId)
		.single();

	if (!org) {
		throw new PermanentWebhookProcessingError(`No organization found for subscription ${subscriptionId}`);
	}

	const { error } = await supabase.from('organizations').update({ subscription_status: 'past_due' }).eq('id', org.id);

	if (error) {
		throw new Error(`Failed to mark org ${org.id} as past_due: ${error.message}`);
	}

	invalidateTierCache(org.id);
	return `payment failure marked past due for organization ${org.id}`;
}

async function processWebhookEvent(supabase: SupabaseClient, event: Stripe.Event): Promise<WebhookProcessingResult> {
	switch (event.type) {
		case 'checkout.session.completed':
			return {
				state: 'processed',
				result: await handleCheckoutCompleted(supabase, event.data.object as Stripe.Checkout.Session)
			};

		case 'customer.subscription.updated': {
			const result = await handleSubscriptionUpdated(supabase, event.data.object as Stripe.Subscription);
			return {
				state: result.state,
				result: result.result
			};
		}

		case 'customer.subscription.deleted':
			return {
				state: 'processed',
				result: await handleSubscriptionDeleted(supabase, event.data.object as Stripe.Subscription)
			};

		case 'invoice.payment_failed':
			return {
				state: 'processed',
				result: await handlePaymentFailed(supabase, event.data.object as Stripe.Invoice)
			};

		default:
			return {
				state: 'ignored',
				result: `unsupported event type ${event.type}`
			};
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
	const objectId = getStripeObjectId(event.data.object);
	const secondaryDedupeKey = buildSecondaryDedupeKey(event);
	const eventCreatedAt = new Date(event.created * 1000).toISOString();

	// ---- Idempotency check ----
	const { data: existing } = await supabase
		.from('stripe_webhook_events')
		.select('id, processed, processing_state, attempt_count')
		.eq('id', event.id)
		.single<ExistingWebhookEvent>();

	if (existing?.processed || (existing?.processing_state && FINAL_PROCESSING_STATES.has(existing.processing_state))) {
		return new Response('Already processed', { status: 200 });
	}

	const { error: ledgerError } = await supabase.rpc('record_stripe_webhook_event_attempt', {
		p_id: event.id,
		p_type: event.type,
		p_data: event.data,
		p_object_id: objectId,
		p_secondary_dedupe_key: secondaryDedupeKey,
		p_event_created_at: eventCreatedAt
	});
	if (ledgerError) {
		console.error(`Error recording webhook ${event.id} (${event.type}):`, sanitizeWebhookError(ledgerError));
		return new Response('Ledger error', { status: 500 });
	}

	try {
		const result = await processWebhookEvent(supabase, event);

		await supabase
			.from('stripe_webhook_events')
			.update({
				processed: result.state === 'processed',
				processed_at: result.state === 'processed' ? new Date().toISOString() : null,
				processing_state: result.state,
				processing_result: result.result,
				last_error: null
			})
			.eq('id', event.id);

		if (result.state === 'processed') {
			await supabase
				.from('stripe_webhook_events')
				.update({
					processing_state: 'superseded',
					processing_result: `superseded by ${event.id}`,
					last_error: null
				})
				.eq('secondary_dedupe_key', secondaryDedupeKey)
				.lt('event_created_at', eventCreatedAt)
				.not('processing_state', 'in', '("processed","permanently_failed")')
				.neq('id', event.id);
		}
	} catch (err) {
		const permanent = err instanceof PermanentWebhookProcessingError;
		const message = sanitizeWebhookError(err);
		console.error(`Error processing webhook ${event.id} (${event.type}):`, message);

		await supabase
			.from('stripe_webhook_events')
			.update({
				processed: false,
				processing_state: permanent ? 'permanently_failed' : 'retryable_failed',
				last_error: message,
				error: message,
				processing_result: permanent ? 'permanent processing failure' : 'retryable processing failure'
			})
			.eq('id', event.id);

		return new Response(permanent ? 'Permanent processing error' : 'Processing error', {
			status: permanent ? 200 : 500
		});
	}

	return new Response('OK', { status: 200 });
};
