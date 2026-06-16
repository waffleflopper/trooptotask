import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	verifyWebhookSignature,
	pauseSubscription,
	resumeSubscription,
	updateSubscriptionPlanMetadata
} from '$lib/server/stripe';
import { getAdminClient } from '$lib/server/supabase';
import type { Tier } from '$lib/types/subscription';
import { getConfiguredPriceCatalog } from '$lib/server/billing/priceCatalog';
import { createSupabaseBillingSnapshotTransitionStore } from '$lib/server/adapters/supabaseBillingSnapshotTransitions';
import { applyBillingSnapshotTransition } from '$lib/server/core/useCases/billingSnapshotTransitions';

const TIER_RANK: Record<string, number> = { free: 1, team: 2, unit: 3 };
export const _FINAL_PROCESSING_STATES = new Set(['processed', 'ignored', 'permanently_failed', 'superseded']);

export type WebhookProcessingState = 'processed' | 'ignored' | 'retryable_failed' | 'permanently_failed' | 'superseded';

interface ExistingWebhookEvent {
	id: string;
	processed?: boolean;
	processing_state?: WebhookProcessingState | null;
	attempt_count?: number | null;
}

export interface WebhookProcessingResult {
	state: Exclude<WebhookProcessingState, 'retryable_failed'>;
	result: string;
}

export interface RecordedWebhookProcessingResult {
	ok: boolean;
	state: WebhookProcessingState;
	result: string;
	status: number;
	error?: string;
}

interface SubscriptionUpdateResult {
	state: 'processed' | 'ignored' | 'superseded';
	result: string;
	commercialPlan?: Tier;
}

export class _PermanentWebhookProcessingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PermanentWebhookProcessingError';
	}
}

/**
 * Stripe v20 moved subscription period timestamps away from the typed
 * top-level Subscription shape. Webhook/API payloads may expose them either
 * on the raw subscription object or on the first subscription item.
 */
interface SubscriptionWebhookData {
	current_period_start?: number;
	current_period_end?: number;
	items?: {
		data?: Array<{
			current_period_start?: number;
			current_period_end?: number;
		}>;
	};
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

export function _getStripeObjectId(object: unknown): string | null {
	if (!object || typeof object !== 'object') return null;
	const id = (object as { id?: unknown }).id;
	return typeof id === 'string' && id.length > 0 ? id : null;
}

export function _buildSecondaryDedupeKey(event: Stripe.Event): string {
	const objectId = _getStripeObjectId(event.data.object);
	return objectId ? `${event.type}:${objectId}` : `${event.type}:${event.id}`;
}

export function _sanitizeWebhookError(err: unknown): string {
	const message = err instanceof Error ? err.message : 'Unknown webhook processing error';
	return message
		.replace(/sk_(live|test)_[A-Za-z0-9_]+/g, '[redacted_stripe_key]')
		.replace(/whsec_\S+/g, '[redacted_webhook_secret]')
		.replace(/stripe-signature[:=]\s*\S+/gi, 'stripe-signature=[redacted]');
}

function isoFromStripeTimestamp(value: number | null | undefined): string | null {
	return typeof value === 'number' ? new Date(value * 1000).toISOString() : null;
}

function getSubscriptionPeriod(subscription: Stripe.Subscription): {
	periodStart: string | null;
	periodEnd: string | null;
} {
	const rawSub = subscription as unknown as SubscriptionWebhookData;
	const firstItem = rawSub.items?.data?.[0];
	return {
		periodStart: isoFromStripeTimestamp(rawSub.current_period_start ?? firstItem?.current_period_start),
		periodEnd: isoFromStripeTimestamp(rawSub.current_period_end ?? firstItem?.current_period_end)
	};
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

async function markCheckoutAttemptCompleted(
	supabase: SupabaseClient,
	orgId: string,
	checkoutSessionId: string,
	eventCreatedAt: string
): Promise<void> {
	// Direct Supabase write: webhook processing runs outside the DataStore port.
	// Keep fields and status values in sync with billingCheckoutAttempts.ts.
	const { error, count } = await supabase
		.from('organization_checkout_attempts')
		.update(
			{
				status: 'completed',
				completed_at: eventCreatedAt
			},
			{ count: 'exact' }
		)
		.eq('organization_id', orgId)
		.eq('stripe_checkout_session_id', checkoutSessionId);

	if (error) {
		throw new Error(
			`Failed to mark checkout attempt ${checkoutSessionId} completed for org ${orgId}: ${error.message}`
		);
	}
	if (!count) {
		console.warn(
			`[checkout-complete] No in-progress attempt found for session ${checkoutSessionId} org ${orgId}; attempt may have been expired or was started before tracking was enabled`
		);
	}
}

async function readOrganizationBillingBySubscription(
	supabase: SupabaseClient,
	subscriptionId: string
): Promise<{
	id: string;
	tier: Tier | null;
	stripe_customer_id: string | null;
	stripe_subscription_id: string | null;
} | null> {
	const { data: snapshot } = await supabase
		.from('organization_billing_snapshots')
		.select('organization_id')
		.eq('stripe_subscription_id', subscriptionId)
		.single<{ organization_id: string }>();

	if (snapshot?.organization_id) {
		const { data: org } = await supabase
			.from('organizations')
			.select('id, tier, stripe_customer_id, stripe_subscription_id')
			.eq('id', snapshot.organization_id)
			.single<{
				id: string;
				tier: Tier | null;
				stripe_customer_id: string | null;
				stripe_subscription_id: string | null;
			}>();
		if (org) return org;
	}

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

	return org ?? null;
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

async function checkGiftPauseBestEffort(
	supabase: SupabaseClient,
	orgId: string,
	orgTier: string,
	subscription: Stripe.Subscription
): Promise<void> {
	try {
		await checkGiftPause(supabase, orgId, orgTier, subscription);
	} catch (err) {
		console.error(`Gift pause sync failed for organization ${orgId}:`, _sanitizeWebhookError(err));
	}
}

async function syncSubscriptionPlanMetadataBestEffort(
	subscription: Stripe.Subscription,
	commercialPlan: Tier,
	priceId: string | null
): Promise<void> {
	if (commercialPlan === 'free' || !priceId) return;
	if (
		subscription.metadata?.tier === commercialPlan &&
		subscription.metadata?.commercialPlan === commercialPlan &&
		subscription.metadata?.priceId === priceId
	) {
		return;
	}

	try {
		await updateSubscriptionPlanMetadata(subscription.id, { tier: commercialPlan, priceId });
	} catch (err) {
		console.error(`Subscription metadata sync failed for ${subscription.id}:`, _sanitizeWebhookError(err));
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
	const tier = session.metadata?.tier;
	const subscriptionId =
		typeof session.subscription === 'string' && session.subscription.length > 0 ? session.subscription : null;
	const customerId = typeof session.customer === 'string' && session.customer.length > 0 ? session.customer : null;
	const eventCreatedAt = new Date(event.created * 1000).toISOString();

	if (!orgId || (tier !== 'team' && tier !== 'unit') || !subscriptionId) {
		throw new _PermanentWebhookProcessingError(
			'checkout.session.completed has missing or invalid orgId, tier (must be team or unit), or subscriptionId'
		);
	}
	if (!customerId) {
		throw new _PermanentWebhookProcessingError('checkout.session.completed missing customerId');
	}
	await markCheckoutAttemptCompleted(supabase, orgId, session.id, eventCreatedAt);

	return applyBillingSnapshotTransition(createSupabaseBillingSnapshotTransitionStore(supabase), {
		kind: 'checkout_completed',
		orgId,
		commercialPlan: tier,
		stripeCustomerId: customerId,
		stripeSubscriptionId: subscriptionId,
		event: {
			id: event.id,
			type: event.type,
			createdAt: eventCreatedAt
		}
	});
}

async function handleSubscriptionUpdated(
	supabase: SupabaseClient,
	subscription: Stripe.Subscription,
	event: Stripe.Event
): Promise<SubscriptionUpdateResult> {
	const orgId = subscription.metadata?.orgId;
	const eventCreatedAt = new Date(event.created * 1000).toISOString();

	if (!orgId) {
		throw new _PermanentWebhookProcessingError('customer.subscription.updated missing orgId metadata');
	}

	const { periodStart, periodEnd } = getSubscriptionPeriod(subscription);
	const trialEnd = isoFromStripeTimestamp(subscription.trial_end);
	const canceledAt = isoFromStripeTimestamp(subscription.canceled_at);
	const { priceId, productId } = getSubscriptionPriceDetails(subscription);
	const customerId =
		typeof subscription.customer === 'string' ? subscription.customer : (subscription.customer?.id ?? null);
	const result = await applyBillingSnapshotTransition(createSupabaseBillingSnapshotTransitionStore(supabase), {
		kind: 'subscription_updated',
		orgId,
		stripeCustomerId: customerId,
		stripeSubscriptionId: subscription.id,
		stripeProductId: productId,
		stripePriceId: priceId,
		status: subscription.status,
		currentPeriodStart: periodStart,
		currentPeriodEnd: periodEnd,
		cancelAtPeriodEnd: subscription.cancel_at_period_end,
		canceledAt,
		cancellationReason: subscription.cancellation_details?.reason ?? null,
		cancellationFeedback: subscription.cancellation_details?.feedback ?? null,
		trialEnd,
		metadataTier: subscription.metadata?.tier ?? null,
		priceCatalog: getConfiguredPriceCatalog(),
		event: {
			id: event.id,
			type: event.type,
			createdAt: eventCreatedAt
		}
	});

	// Check if a gift should pause/resume this subscription
	if (result.state === 'processed' && result.commercialPlan) {
		await checkGiftPauseBestEffort(supabase, orgId, result.commercialPlan, subscription);
		await syncSubscriptionPlanMetadataBestEffort(subscription, result.commercialPlan, priceId);
	}
	return result;
}

async function handleSubscriptionDeleted(
	supabase: SupabaseClient,
	subscription: Stripe.Subscription,
	event: Stripe.Event
): Promise<WebhookProcessingResult> {
	const orgId = subscription.metadata?.orgId;
	const eventCreatedAt = new Date(event.created * 1000).toISOString();
	const { periodStart, periodEnd } = getSubscriptionPeriod(subscription);

	if (!orgId) {
		throw new _PermanentWebhookProcessingError('customer.subscription.deleted missing orgId metadata');
	}

	return applyBillingSnapshotTransition(createSupabaseBillingSnapshotTransitionStore(supabase), {
		kind: 'subscription_deleted',
		orgId,
		stripeCustomerId:
			typeof subscription.customer === 'string' ? subscription.customer : (subscription.customer?.id ?? null),
		currentPeriodStart: periodStart,
		currentPeriodEnd: periodEnd,
		canceledAt: isoFromStripeTimestamp(subscription.canceled_at) ?? eventCreatedAt,
		cancellationReason: subscription.cancellation_details?.reason ?? null,
		cancellationFeedback: subscription.cancellation_details?.feedback ?? null,
		event: {
			id: event.id,
			type: event.type,
			createdAt: eventCreatedAt
		}
	});
}

async function handlePaymentFailed(
	supabase: SupabaseClient,
	invoice: Stripe.Invoice,
	event: Stripe.Event
): Promise<WebhookProcessingResult> {
	const subscriptionId = getSubscriptionIdFromInvoice(invoice);
	const eventCreatedAt = new Date(event.created * 1000).toISOString();

	if (!subscriptionId) {
		throw new _PermanentWebhookProcessingError('invoice.payment_failed missing subscription ID');
	}

	const org = await readOrganizationBillingBySubscription(supabase, subscriptionId);

	if (!org) {
		throw new Error(`No organization found for subscription ${subscriptionId}`);
	}

	return applyBillingSnapshotTransition(createSupabaseBillingSnapshotTransitionStore(supabase), {
		kind: 'payment_failed',
		orgId: org.id,
		stripeSubscriptionId: subscriptionId,
		fallbackCommercialPlan: org.tier,
		fallbackStripeCustomerId: org.stripe_customer_id,
		fallbackStripeSubscriptionId: org.stripe_subscription_id,
		event: {
			id: event.id,
			type: event.type,
			createdAt: eventCreatedAt
		}
	});
}

async function handlePaymentSucceeded(
	supabase: SupabaseClient,
	invoice: Stripe.Invoice,
	event: Stripe.Event
): Promise<WebhookProcessingResult> {
	const subscriptionId = getSubscriptionIdFromInvoice(invoice);
	const eventCreatedAt = new Date(event.created * 1000).toISOString();

	if (!subscriptionId) {
		throw new _PermanentWebhookProcessingError(`${event.type} missing subscription ID`);
	}

	const org = await readOrganizationBillingBySubscription(supabase, subscriptionId);
	if (!org) {
		throw new Error(`No organization found for subscription ${subscriptionId}`);
	}

	return applyBillingSnapshotTransition(createSupabaseBillingSnapshotTransitionStore(supabase), {
		kind: 'payment_succeeded',
		orgId: org.id,
		stripeSubscriptionId: subscriptionId,
		fallbackCommercialPlan: org.tier,
		fallbackStripeCustomerId: org.stripe_customer_id,
		fallbackStripeSubscriptionId: org.stripe_subscription_id,
		event: {
			id: event.id,
			type: event.type,
			createdAt: eventCreatedAt
		}
	});
}

export async function _processWebhookEvent(
	supabase: SupabaseClient,
	event: Stripe.Event
): Promise<WebhookProcessingResult> {
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

		case 'invoice.payment_succeeded':
		case 'invoice.paid':
			return handlePaymentSucceeded(supabase, event.data.object as Stripe.Invoice, event);

		default:
			return {
				state: 'ignored',
				result: `unsupported event type ${event.type}`
			};
	}
}

export async function _recordStripeWebhookEventAttempt(
	supabase: SupabaseClient,
	event: Stripe.Event,
	metadata: {
		objectId?: string | null;
		secondaryDedupeKey?: string;
		eventCreatedAt?: string;
	} = {}
): Promise<boolean> {
	const objectId = metadata.objectId ?? _getStripeObjectId(event.data.object);
	const secondaryDedupeKey = metadata.secondaryDedupeKey ?? _buildSecondaryDedupeKey(event);
	const eventCreatedAt = metadata.eventCreatedAt ?? new Date(event.created * 1000).toISOString();

	const { data: attemptCount, error: ledgerError } = await supabase.rpc('record_stripe_webhook_event_attempt', {
		p_id: event.id,
		p_type: event.type,
		p_data: event.data,
		p_object_id: objectId,
		p_secondary_dedupe_key: secondaryDedupeKey,
		p_event_created_at: eventCreatedAt
	});
	if (ledgerError) {
		throw new Error(`Failed to record webhook attempt: ${_sanitizeWebhookError(ledgerError)}`);
	}

	return typeof attemptCount === 'number';
}

export async function _recordRetryableStripeWebhookEventAttempt(
	supabase: SupabaseClient,
	event: Stripe.Event,
	metadata: {
		objectId?: string | null;
		secondaryDedupeKey?: string;
		eventCreatedAt?: string;
	} = {}
): Promise<number> {
	const objectId = metadata.objectId ?? _getStripeObjectId(event.data.object);
	const secondaryDedupeKey = metadata.secondaryDedupeKey ?? _buildSecondaryDedupeKey(event);
	const eventCreatedAt = metadata.eventCreatedAt ?? new Date(event.created * 1000).toISOString();

	const { data: attemptCount, error: ledgerError } = await supabase.rpc(
		'record_retryable_stripe_webhook_event_attempt',
		{
			p_id: event.id,
			p_type: event.type,
			p_data: event.data,
			p_object_id: objectId,
			p_secondary_dedupe_key: secondaryDedupeKey,
			p_event_created_at: eventCreatedAt
		}
	);
	if (ledgerError) {
		throw new Error(`Failed to record webhook retry attempt: ${_sanitizeWebhookError(ledgerError)}`);
	}
	if (typeof attemptCount !== 'number') {
		throw new _PermanentWebhookProcessingError('billing event is no longer retryable');
	}

	return attemptCount;
}

export async function _processRecordedStripeWebhookEvent(
	supabase: SupabaseClient,
	event: Stripe.Event,
	metadata: {
		secondaryDedupeKey?: string;
		eventCreatedAt?: string;
	} = {}
): Promise<RecordedWebhookProcessingResult> {
	const secondaryDedupeKey = metadata.secondaryDedupeKey ?? _buildSecondaryDedupeKey(event);
	const eventCreatedAt = metadata.eventCreatedAt ?? new Date(event.created * 1000).toISOString();

	try {
		const result = await _processWebhookEvent(supabase, event);

		const { error: stateUpdateError } = await supabase
			.from('stripe_webhook_events')
			.update({
				processed: result.state === 'processed',
				processed_at: result.state === 'processed' ? new Date().toISOString() : null,
				processing_state: result.state,
				processing_result: result.result,
				last_error: null
			})
			.eq('id', event.id);
		if (stateUpdateError) {
			console.error(`Failed to update webhook ledger state for ${event.id}:`, _sanitizeWebhookError(stateUpdateError));
		}

		if (result.state === 'processed') {
			const { error: supersededUpdateError } = await supabase
				.from('stripe_webhook_events')
				.update({
					processing_state: 'superseded',
					processing_result: `superseded by ${event.id}`,
					last_error: null
				})
				.eq('secondary_dedupe_key', secondaryDedupeKey)
				.lt('event_created_at', eventCreatedAt)
				.not('processing_state', 'in', '("processed","ignored","permanently_failed","superseded")')
				.neq('id', event.id);
			if (supersededUpdateError) {
				console.error(
					`Failed to mark older webhook events superseded for ${event.id}:`,
					_sanitizeWebhookError(supersededUpdateError)
				);
			}
		}

		return { ok: true, state: result.state, result: result.result, status: 200 };
	} catch (err) {
		const permanent = err instanceof _PermanentWebhookProcessingError;
		const message = _sanitizeWebhookError(err);
		console.error(`Error processing webhook ${event.id} (${event.type}):`, message);

		const { error: failureUpdateError } = await supabase
			.from('stripe_webhook_events')
			.update({
				processed: false,
				processing_state: permanent ? 'permanently_failed' : 'retryable_failed',
				last_error: message,
				error: message,
				processing_result: permanent ? 'permanent processing failure' : 'retryable processing failure'
			})
			.eq('id', event.id)
			.not('processing_state', 'in', '("processed","ignored","permanently_failed","superseded")');
		if (failureUpdateError) {
			console.error(
				`Failed to update webhook ledger failure state for ${event.id}:`,
				_sanitizeWebhookError(failureUpdateError)
			);
		}

		return {
			ok: false,
			state: permanent ? 'permanently_failed' : 'retryable_failed',
			result: permanent ? 'permanent processing failure' : 'retryable processing failure',
			status: permanent ? 200 : 500,
			error: message
		};
	}
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function handleStripeWebhookPost(request: Request): Promise<Response> {
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
	const objectId = _getStripeObjectId(event.data.object);
	const secondaryDedupeKey = _buildSecondaryDedupeKey(event);
	const eventCreatedAt = new Date(event.created * 1000).toISOString();

	// ---- Idempotency check ----
	const { data: existing } = await supabase
		.from('stripe_webhook_events')
		.select('id, processed, processing_state, attempt_count')
		.eq('id', event.id)
		.single<ExistingWebhookEvent>();

	if (existing?.processed || (existing?.processing_state && _FINAL_PROCESSING_STATES.has(existing.processing_state))) {
		return new Response('Already processed', { status: 200 });
	}

	try {
		const attemptRecorded = await _recordStripeWebhookEventAttempt(supabase, event, {
			objectId,
			secondaryDedupeKey,
			eventCreatedAt
		});
		if (!attemptRecorded) {
			return new Response('Already processed', { status: 200 });
		}
	} catch (err) {
		console.error(`Error recording webhook ${event.id} (${event.type}):`, _sanitizeWebhookError(err));
		return new Response('Ledger error', { status: 500 });
	}

	const result = await _processRecordedStripeWebhookEvent(supabase, event, { secondaryDedupeKey, eventCreatedAt });
	if (!result.ok) {
		return new Response(result.state === 'permanently_failed' ? 'Permanent processing error' : 'Processing error', {
			status: result.status
		});
	}

	return new Response('OK', { status: 200 });
}
