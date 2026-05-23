import type { RequestHandler } from './$types';
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyWebhookSignature, pauseSubscription, resumeSubscription } from '$lib/server/stripe';
import { getAdminClient } from '$lib/server/supabase';
import { invalidateTierCache } from '$lib/server/subscription';
import type { Tier } from '$lib/types/subscription';
import { configuredPriceCatalog, lookupPriceCatalogEntry } from '$lib/server/billing/priceCatalog';

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
	state: 'processed' | 'ignored' | 'superseded';
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
	current_period_start?: number;
	current_period_end?: number;
}

interface ExistingBillingSnapshot {
	id?: string;
	commercial_plan?: Tier | null;
	stripe_customer_id?: string | null;
	stripe_subscription_id?: string | null;
	stripe_product_id?: string | null;
	stripe_price_id?: string | null;
	current_period_start?: string | null;
	current_period_end?: string | null;
	cancel_at_period_end?: boolean | null;
	canceled_at?: string | null;
	trial_end?: string | null;
	last_stripe_event_created_at: string | null;
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

function isoFromStripeTimestamp(value: number | null | undefined): string | null {
	return typeof value === 'number' ? new Date(value * 1000).toISOString() : null;
}

function getSubscriptionPriceDetails(subscription: Stripe.Subscription): {
	priceId: string | null;
	productId: string | null;
} {
	const price = subscription.items?.data?.[0]?.price;
	const product = price?.product;
	return {
		priceId: price?.id ?? null,
		productId: typeof product === 'string' ? product : (product?.id ?? null)
	};
}

function legacyOrganizationStatus(status: Stripe.Subscription.Status): string | null {
	switch (status) {
		case 'active':
		case 'trialing':
		case 'paused':
			return 'active';
		case 'past_due':
		case 'unpaid':
			return 'past_due';
		case 'canceled':
			return 'canceled';
		case 'incomplete':
		case 'incomplete_expired':
			return null;
		default:
			return null;
	}
}

async function readBillingSnapshotForTransition(
	supabase: SupabaseClient,
	orgId: string
): Promise<ExistingBillingSnapshot | null> {
	const { data, error } = await supabase
		.from('organization_billing_snapshots')
		.select(
			'id, commercial_plan, stripe_customer_id, stripe_subscription_id, stripe_product_id, stripe_price_id, current_period_start, current_period_end, cancel_at_period_end, canceled_at, trial_end, last_stripe_event_created_at'
		)
		.eq('organization_id', orgId)
		.single<ExistingBillingSnapshot>();

	if (error && 'code' in error && error.code === 'PGRST116') return null;
	if (error) throw new Error(`Failed to read billing snapshot for org ${orgId}: ${error.message}`);
	return data ?? null;
}

function isStaleBillingEvent(snapshot: ExistingBillingSnapshot | null, eventCreatedAt: string): boolean {
	return !!(
		snapshot?.last_stripe_event_created_at &&
		new Date(snapshot.last_stripe_event_created_at).getTime() > new Date(eventCreatedAt).getTime()
	);
}

async function upsertBillingSnapshot(supabase: SupabaseClient, values: Record<string, unknown>): Promise<boolean> {
	const { data, error } = await supabase.rpc('upsert_organization_billing_snapshot_if_current', {
		p_snapshot: values
	});
	if (error) throw new Error(`Failed to update billing snapshot: ${error.message}`);
	return data === true;
}

function subscriptionCollectionStatus(status: Stripe.Subscription.Status): string {
	switch (status) {
		case 'active':
		case 'trialing':
		case 'paused':
			return 'current';
		case 'past_due':
			return 'payment_failed_grace';
		case 'unpaid':
			return 'payment_failed_terminal';
		case 'canceled':
			return 'canceled';
		case 'incomplete':
		case 'incomplete_expired':
			return 'pending_activation';
		default:
			return 'pending_activation';
	}
}

async function updateLegacyOrganizationBillingMirror(
	supabase: SupabaseClient,
	orgId: string,
	values: Record<string, unknown>
): Promise<void> {
	const { error } = await supabase.from('organizations').update(values).eq('id', orgId);
	if (error) throw new Error(`Failed to update org ${orgId}: ${error.message}`);
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

async function handleCheckoutCompleted(
	supabase: SupabaseClient,
	session: Stripe.Checkout.Session,
	event: Stripe.Event
): Promise<WebhookProcessingResult> {
	const orgId = session.metadata?.orgId;
	const tier = session.metadata?.tier as Tier | undefined;
	const subscriptionId = session.subscription as string | null;
	const eventCreatedAt = new Date(event.created * 1000).toISOString();

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

	const snapshot = await readBillingSnapshotForTransition(supabase, orgId);
	if (isStaleBillingEvent(snapshot, eventCreatedAt)) {
		return {
			state: 'superseded',
			result: `checkout completion for organization ${orgId} is older than the current billing snapshot`
		};
	}

	const snapshotUpdated = await upsertBillingSnapshot(supabase, {
		organization_id: orgId,
		source: 'stripe',
		commercial_plan: tier,
		stripe_customer_id: session.customer as string,
		stripe_subscription_id: subscriptionId,
		stripe_product_id: null,
		stripe_price_id: null,
		subscription_status: 'incomplete',
		collection_status: 'pending_activation',
		current_period_start: null,
		current_period_end: null,
		cancel_at_period_end: false,
		canceled_at: null,
		trial_end: null,
		sync_status: 'pending',
		last_stripe_event_id: event.id,
		last_stripe_event_type: event.type,
		last_stripe_event_created_at: eventCreatedAt,
		last_processed_at: new Date().toISOString(),
		drift_detected: false
	});
	if (!snapshotUpdated) {
		return {
			state: 'superseded',
			result: `checkout completion for organization ${orgId} lost a concurrent billing snapshot update`
		};
	}

	await updateLegacyOrganizationBillingMirror(supabase, orgId, {
		stripe_customer_id: session.customer as string,
		stripe_subscription_id: subscriptionId,
		subscription_status: 'incomplete',
		current_period_end: null
	});

	invalidateTierCache(orgId);
	return {
		state: 'processed',
		result: `checkout pending activation recorded for organization ${orgId}`
	};
}

async function handleSubscriptionUpdated(
	supabase: SupabaseClient,
	subscription: Stripe.Subscription,
	event: Stripe.Event
): Promise<SubscriptionUpdateResult> {
	const orgId = subscription.metadata?.orgId;
	const eventCreatedAt = new Date(event.created * 1000).toISOString();

	if (!orgId) {
		throw new PermanentWebhookProcessingError('customer.subscription.updated missing orgId metadata');
	}

	const snapshot = await readBillingSnapshotForTransition(supabase, orgId);
	if (isStaleBillingEvent(snapshot, eventCreatedAt)) {
		return {
			state: 'superseded',
			result: `subscription update for organization ${orgId} is older than the current billing snapshot`
		};
	}

	// current_period_end was removed from Stripe SDK v20 types but is
	// still present in the webhook payload.
	const rawSub = subscription as unknown as SubscriptionWebhookData;
	const periodStart = isoFromStripeTimestamp(rawSub.current_period_start);
	const periodEnd = isoFromStripeTimestamp(rawSub.current_period_end);
	const trialEnd = isoFromStripeTimestamp(subscription.trial_end);
	const canceledAt = isoFromStripeTimestamp(subscription.canceled_at);
	const { priceId, productId } = getSubscriptionPriceDetails(subscription);
	const catalogLookup = lookupPriceCatalogEntry(configuredPriceCatalog, priceId);
	const grantsPaidAccess =
		subscription.status === 'active' || subscription.status === 'trialing' || subscription.status === 'paused';
	const retainsCommercialPlan = grantsPaidAccess || subscription.status === 'past_due';

	if (retainsCommercialPlan && !catalogLookup.ok) {
		throw new PermanentWebhookProcessingError(
			`customer.subscription.updated cannot grant access for ${orgId}: ${catalogLookup.reason}`
		);
	}

	if (
		retainsCommercialPlan &&
		catalogLookup.ok &&
		subscription.metadata?.tier &&
		subscription.metadata.tier !== catalogLookup.entry.commercialPlan
	) {
		throw new PermanentWebhookProcessingError(
			`customer.subscription.updated metadata tier ${subscription.metadata.tier} does not match price catalog plan ${catalogLookup.entry.commercialPlan}`
		);
	}

	const commercialPlan = retainsCommercialPlan && catalogLookup.ok ? catalogLookup.entry.commercialPlan : 'free';
	const legacyStatus = legacyOrganizationStatus(subscription.status);

	const snapshotUpdated = await upsertBillingSnapshot(supabase, {
		organization_id: orgId,
		source: 'stripe',
		commercial_plan: commercialPlan,
		stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id,
		stripe_subscription_id: subscription.id,
		stripe_product_id: productId,
		stripe_price_id: priceId,
		subscription_status: subscription.status,
		collection_status: subscriptionCollectionStatus(subscription.status),
		current_period_start: periodStart,
		current_period_end: periodEnd,
		cancel_at_period_end: subscription.cancel_at_period_end,
		canceled_at: canceledAt,
		trial_end: trialEnd,
		sync_status: 'synced',
		last_stripe_event_id: event.id,
		last_stripe_event_type: event.type,
		last_stripe_event_created_at: eventCreatedAt,
		last_processed_at: new Date().toISOString(),
		drift_detected: false
	});
	if (!snapshotUpdated) {
		return {
			state: 'superseded',
			result: `subscription update for organization ${orgId} lost a concurrent billing snapshot update`
		};
	}

	await updateLegacyOrganizationBillingMirror(supabase, orgId, {
		tier: commercialPlan,
		stripe_subscription_id: subscription.id,
		subscription_status: legacyStatus,
		current_period_end: periodEnd
	});

	invalidateTierCache(orgId);

	// Check if a gift should pause/resume this subscription
	await checkGiftPause(supabase, orgId, commercialPlan, subscription);
	return {
		state: 'processed',
		result: `subscription updated for organization ${orgId}`
	};
}

async function handleSubscriptionDeleted(
	supabase: SupabaseClient,
	subscription: Stripe.Subscription,
	event: Stripe.Event
): Promise<WebhookProcessingResult> {
	const orgId = subscription.metadata?.orgId;
	const eventCreatedAt = new Date(event.created * 1000).toISOString();

	if (!orgId) {
		throw new PermanentWebhookProcessingError('customer.subscription.deleted missing orgId metadata');
	}

	const snapshot = await readBillingSnapshotForTransition(supabase, orgId);
	if (isStaleBillingEvent(snapshot, eventCreatedAt)) {
		return {
			state: 'superseded',
			result: `subscription deletion for organization ${orgId} is older than the current billing snapshot`
		};
	}

	const snapshotUpdated = await upsertBillingSnapshot(supabase, {
		organization_id: orgId,
		source: 'stripe',
		commercial_plan: 'free',
		stripe_customer_id:
			snapshot?.stripe_customer_id ??
			(typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id),
		stripe_subscription_id: null,
		stripe_product_id: snapshot?.stripe_product_id ?? null,
		stripe_price_id: snapshot?.stripe_price_id ?? null,
		subscription_status: 'canceled',
		collection_status: 'canceled',
		current_period_start: snapshot?.current_period_start ?? null,
		current_period_end: null,
		cancel_at_period_end: false,
		canceled_at: isoFromStripeTimestamp(subscription.canceled_at) ?? eventCreatedAt,
		trial_end: snapshot?.trial_end ?? null,
		sync_status: 'synced',
		last_stripe_event_id: event.id,
		last_stripe_event_type: event.type,
		last_stripe_event_created_at: eventCreatedAt,
		last_processed_at: new Date().toISOString(),
		drift_detected: false
	});
	if (!snapshotUpdated) {
		return {
			state: 'superseded',
			result: `subscription deletion for organization ${orgId} lost a concurrent billing snapshot update`
		};
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
	return {
		state: 'processed',
		result: `subscription deleted for organization ${orgId}`
	};
}

async function handlePaymentFailed(
	supabase: SupabaseClient,
	invoice: Stripe.Invoice,
	event: Stripe.Event
): Promise<WebhookProcessingResult> {
	const subscriptionId = getSubscriptionIdFromInvoice(invoice);
	const eventCreatedAt = new Date(event.created * 1000).toISOString();

	if (!subscriptionId) {
		throw new PermanentWebhookProcessingError('invoice.payment_failed missing subscription ID');
	}

	// Find the org by its stripe_subscription_id
	const { data: org } = await supabase
		.from('organizations')
		.select('id, tier, stripe_customer_id, stripe_subscription_id')
		.eq('stripe_subscription_id', subscriptionId)
		.single<{
			id: string;
			tier: Tier | null;
			stripe_customer_id: string | null;
			stripe_subscription_id: string | null;
		}>();

	if (!org) {
		throw new PermanentWebhookProcessingError(`No organization found for subscription ${subscriptionId}`);
	}

	const snapshot = await readBillingSnapshotForTransition(supabase, org.id);
	if (isStaleBillingEvent(snapshot, eventCreatedAt)) {
		return {
			state: 'superseded',
			result: `payment failure for organization ${org.id} is older than the current billing snapshot`
		};
	}

	const snapshotUpdated = await upsertBillingSnapshot(supabase, {
		organization_id: org.id,
		source: 'stripe',
		commercial_plan: snapshot?.commercial_plan ?? org.tier ?? 'free',
		stripe_customer_id: snapshot?.stripe_customer_id ?? org.stripe_customer_id,
		stripe_subscription_id: snapshot?.stripe_subscription_id ?? org.stripe_subscription_id ?? subscriptionId,
		stripe_product_id: snapshot?.stripe_product_id ?? null,
		stripe_price_id: snapshot?.stripe_price_id ?? null,
		subscription_status: 'past_due',
		collection_status: 'payment_failed_grace',
		current_period_start: snapshot?.current_period_start ?? null,
		current_period_end: snapshot?.current_period_end ?? null,
		cancel_at_period_end: snapshot?.cancel_at_period_end ?? false,
		canceled_at: snapshot?.canceled_at ?? null,
		trial_end: snapshot?.trial_end ?? null,
		sync_status: 'synced',
		last_stripe_event_id: event.id,
		last_stripe_event_type: event.type,
		last_stripe_event_created_at: eventCreatedAt,
		last_processed_at: new Date().toISOString(),
		drift_detected: false
	});
	if (!snapshotUpdated) {
		return {
			state: 'superseded',
			result: `payment failure for organization ${org.id} lost a concurrent billing snapshot update`
		};
	}

	const { error } = await supabase.from('organizations').update({ subscription_status: 'past_due' }).eq('id', org.id);

	if (error) {
		throw new Error(`Failed to mark org ${org.id} as past_due: ${error.message}`);
	}

	invalidateTierCache(org.id);
	return {
		state: 'processed',
		result: `payment failure marked past due for organization ${org.id}`
	};
}

async function processWebhookEvent(supabase: SupabaseClient, event: Stripe.Event): Promise<WebhookProcessingResult> {
	switch (event.type) {
		case 'checkout.session.completed':
			return handleCheckoutCompleted(supabase, event.data.object as Stripe.Checkout.Session, event);

		case 'customer.subscription.updated': {
			const result = await handleSubscriptionUpdated(supabase, event.data.object as Stripe.Subscription, event);
			return {
				state: result.state,
				result: result.result
			};
		}

		case 'customer.subscription.deleted':
			return handleSubscriptionDeleted(supabase, event.data.object as Stripe.Subscription, event);

		case 'invoice.payment_failed':
			return handlePaymentFailed(supabase, event.data.object as Stripe.Invoice, event);

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
