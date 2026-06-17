import { invalidateTierCache } from '$lib/server/subscription';
import { lookupPriceCatalogEntry } from '$lib/server/billing/priceCatalog';
import { legacyOrganizationSubscriptionId } from '$lib/server/billing/subscriptionRetentionPolicy';
import type {
	BillingCancellationFeedback,
	BillingSnapshot,
	BillingSyncStatus,
	PriceCatalogEntry,
	SubscriptionStatus,
	Tier
} from '$lib/types/subscription';

export interface ExistingBillingSnapshot {
	organization_id?: string;
	commercial_plan?: Tier | null;
	stripe_customer_id?: string | null;
	stripe_subscription_id?: string | null;
	stripe_product_id?: string | null;
	stripe_price_id?: string | null;
	subscription_status?: SubscriptionStatus | null;
	collection_status?: string | null;
	current_period_start?: string | null;
	current_period_end?: string | null;
	cancel_at_period_end?: boolean | null;
	canceled_at?: string | null;
	cancellation_reason?: string | null;
	cancellation_feedback?: BillingCancellationFeedback | null;
	trial_end?: string | null;
	last_stripe_event_id?: string | null;
	last_stripe_event_type?: string | null;
	last_stripe_event_created_at: string | null;
}

export type BillingSnapshotUpsert = {
	organization_id: string;
	source: BillingSnapshot['source'];
	commercial_plan: Tier;
	stripe_customer_id: string | null;
	stripe_subscription_id: string | null;
	stripe_product_id: string | null;
	stripe_price_id: string | null;
	subscription_status: SubscriptionStatus | null;
	collection_status: string | null;
	current_period_start: string | null;
	current_period_end: string | null;
	cancel_at_period_end: boolean;
	canceled_at: string | null;
	cancellation_reason?: string | null;
	cancellation_feedback?: BillingCancellationFeedback | null;
	trial_end: string | null;
	sync_status: BillingSyncStatus;
	last_stripe_event_id?: string | null;
	last_stripe_event_type?: string | null;
	last_stripe_event_created_at?: string | null;
	last_processed_at: string;
	last_reconciled_at?: string | null;
	reconciliation_result?: string | null;
	drift_detected: boolean;
};

export interface BillingSnapshotTransitionStore {
	readSnapshot(orgId: string): Promise<ExistingBillingSnapshot | null>;
	/**
	 * Implementations must write the canonical snapshot and legacy organization mirror as one operation.
	 * When eventPosition is present, implementations must use the stale-event-protected write path.
	 * The event fields in snapshot remain the source of truth for persisted snapshot metadata.
	 */
	writeSnapshotAndMirrorIfCurrent(input: {
		snapshot: BillingSnapshotUpsert;
		mirror: Record<string, unknown>;
		eventPosition?: BillingEventPosition;
	}): Promise<boolean>;
}

export interface BillingEventPosition {
	eventId: string;
	eventType: string;
	eventCreatedAt: string;
}

interface StripeEventFact {
	id: string;
	type: string;
	createdAt: string;
}

export type BillingSnapshotTransition =
	| {
			kind: 'checkout_completed';
			orgId: string;
			commercialPlan: Exclude<Tier, 'free'>;
			stripeCustomerId: string;
			stripeSubscriptionId: string;
			event: StripeEventFact;
			processedAt?: string;
	  }
	| {
			kind: 'subscription_updated';
			orgId: string;
			stripeCustomerId: string | null;
			stripeSubscriptionId: string;
			stripeProductId: string | null;
			stripePriceId: string | null;
			status: SubscriptionStatus;
			currentPeriodStart: string | null;
			currentPeriodEnd: string | null;
			cancelAtPeriodEnd: boolean;
			canceledAt: string | null;
			cancellationReason: string | null;
			cancellationFeedback: BillingCancellationFeedback | null;
			trialEnd: string | null;
			metadataTier?: string | null;
			priceCatalog: PriceCatalogEntry[];
			event: StripeEventFact;
			processedAt?: string;
	  }
	| {
			kind: 'subscription_deleted';
			orgId: string;
			stripeCustomerId: string | null;
			currentPeriodStart: string | null;
			currentPeriodEnd: string | null;
			canceledAt: string | null;
			cancellationReason: string | null;
			cancellationFeedback: BillingCancellationFeedback | null;
			event: StripeEventFact;
			processedAt?: string;
	  }
	| {
			kind: 'payment_failed';
			orgId: string;
			stripeSubscriptionId: string;
			fallbackCommercialPlan: Tier | null;
			fallbackStripeCustomerId: string | null;
			fallbackStripeSubscriptionId?: string | null;
			event: StripeEventFact;
			processedAt?: string;
	  }
	| {
			kind: 'payment_succeeded';
			orgId: string;
			stripeSubscriptionId: string;
			fallbackCommercialPlan: Tier | null;
			fallbackStripeCustomerId: string | null;
			fallbackStripeSubscriptionId?: string | null;
			event: StripeEventFact;
			processedAt?: string;
	  }
	| {
			kind: 'immediate_cancellation_requested';
			orgId: string;
			stripeCustomerId: string | null;
			cancellationFeedback: BillingCancellationFeedback | null;
			eventPosition?: BillingEventPosition;
			processedAt?: string;
	  };

export type BillingSnapshotTransitionResult =
	| { state: 'processed'; result: string; orgId: string; commercialPlan?: Tier }
	| { state: 'superseded'; result: string; orgId: string }
	| { state: 'ignored'; result: string; orgId?: string };

export async function applyBillingSnapshotTransition(
	store: BillingSnapshotTransitionStore,
	transition: BillingSnapshotTransition
): Promise<BillingSnapshotTransitionResult> {
	if (transition.kind === 'immediate_cancellation_requested') {
		return applyImmediateCancellationTransition(store, transition);
	}

	const snapshot = await store.readSnapshot(transition.orgId);
	if (isStaleBillingEvent(snapshot, transition.event.createdAt, transition.event.id)) {
		return superseded(
			transition.orgId,
			transitionSubject(transition.kind),
			'is older than the current billing snapshot'
		);
	}

	const planned = planEventTransition(transition, snapshot);
	const snapshotUpdated = await store.writeSnapshotAndMirrorIfCurrent({
		snapshot: planned.snapshot,
		mirror: planned.mirror,
		eventPosition: eventPosition(transition.event)
	});

	if (!snapshotUpdated) {
		return superseded(
			transition.orgId,
			transitionSubject(transition.kind),
			'lost a concurrent billing snapshot update'
		);
	}

	invalidateTierCache(transition.orgId);

	return {
		state: 'processed',
		result: planned.result,
		orgId: transition.orgId,
		commercialPlan: planned.commercialPlan
	};
}

async function applyImmediateCancellationTransition(
	store: BillingSnapshotTransitionStore,
	transition: Extract<BillingSnapshotTransition, { kind: 'immediate_cancellation_requested' }>
): Promise<BillingSnapshotTransitionResult> {
	const snapshot = await store.readSnapshot(transition.orgId);
	const processedAt = transition.processedAt ?? new Date().toISOString();
	return writeImmediateCancellation(store, transition, snapshot, processedAt);
}

async function writeImmediateCancellation(
	store: BillingSnapshotTransitionStore,
	transition: Extract<BillingSnapshotTransition, { kind: 'immediate_cancellation_requested' }>,
	currentSnapshot: ExistingBillingSnapshot | null,
	processedAt: string
): Promise<BillingSnapshotTransitionResult> {
	const stripeSubscriptionId = currentSnapshot?.stripe_subscription_id ?? null;
	const snapshotUpdated = await store.writeSnapshotAndMirrorIfCurrent({
		snapshot: {
			organization_id: transition.orgId,
			source: 'stripe',
			commercial_plan: 'free',
			stripe_customer_id: transition.stripeCustomerId,
			stripe_subscription_id: stripeSubscriptionId,
			stripe_product_id: null,
			stripe_price_id: null,
			subscription_status: 'canceled',
			collection_status: 'canceled',
			current_period_start: null,
			current_period_end: null,
			cancel_at_period_end: false,
			canceled_at: processedAt,
			cancellation_reason: 'cancellation_requested',
			cancellation_feedback: transition.cancellationFeedback,
			trial_end: null,
			sync_status: 'pending',
			last_stripe_event_id: currentSnapshot?.last_stripe_event_id ?? null,
			last_stripe_event_type: currentSnapshot?.last_stripe_event_type ?? null,
			last_stripe_event_created_at: currentSnapshot?.last_stripe_event_created_at ?? null,
			last_processed_at: processedAt,
			last_reconciled_at: null,
			reconciliation_result: 'local_immediate_cancellation_pending_webhook',
			drift_detected: false
		},
		mirror: {
			tier: 'free',
			subscription_status: null,
			stripe_subscription_id: stripeSubscriptionId,
			current_period_end: null
		},
		eventPosition: transition.eventPosition ?? snapshotEventPosition(currentSnapshot)
	});
	if (!snapshotUpdated) {
		return superseded(transition.orgId, 'immediate cancellation', 'lost a concurrent billing snapshot update');
	}

	invalidateTierCache(transition.orgId);

	return {
		state: 'processed',
		result: `immediate cancellation recorded for organization ${transition.orgId}`,
		orgId: transition.orgId
	};
}

function planEventTransition(
	transition: Exclude<BillingSnapshotTransition, { kind: 'immediate_cancellation_requested' }>,
	snapshot: ExistingBillingSnapshot | null
): { snapshot: BillingSnapshotUpsert; mirror: Record<string, unknown>; result: string; commercialPlan?: Tier } {
	switch (transition.kind) {
		case 'checkout_completed':
			return planCheckoutCompletedTransition(transition);
		case 'subscription_updated':
			return planSubscriptionUpdatedTransition(transition, snapshot);
		case 'subscription_deleted':
			return planSubscriptionDeletedTransition(transition, snapshot);
		case 'payment_failed':
			return planPaymentFailedTransition(transition, snapshot);
		case 'payment_succeeded':
			return planPaymentSucceededTransition(transition, snapshot);
	}
}

function planCheckoutCompletedTransition(
	transition: Extract<BillingSnapshotTransition, { kind: 'checkout_completed' }>
): { snapshot: BillingSnapshotUpsert; mirror: Record<string, unknown>; result: string; commercialPlan: Tier } {
	return {
		snapshot: {
			...eventSnapshotBase(transition, 'pending'),
			commercial_plan: transition.commercialPlan,
			stripe_customer_id: transition.stripeCustomerId,
			stripe_subscription_id: transition.stripeSubscriptionId,
			stripe_product_id: null,
			stripe_price_id: null,
			subscription_status: 'incomplete',
			collection_status: 'pending_activation',
			current_period_start: null,
			current_period_end: null,
			cancel_at_period_end: false,
			canceled_at: null,
			trial_end: null
		},
		mirror: {
			stripe_customer_id: transition.stripeCustomerId,
			stripe_subscription_id: transition.stripeSubscriptionId,
			subscription_status: 'incomplete',
			current_period_end: null
		},
		result: `checkout pending activation recorded for organization ${transition.orgId}`,
		commercialPlan: transition.commercialPlan
	};
}

function planSubscriptionUpdatedTransition(
	transition: Extract<BillingSnapshotTransition, { kind: 'subscription_updated' }>,
	snapshot: ExistingBillingSnapshot | null
): { snapshot: BillingSnapshotUpsert; mirror: Record<string, unknown>; result: string; commercialPlan: Tier } {
	const retainsPlan = retainsCommercialPlan(transition.status);
	const catalogLookup = lookupPriceCatalogEntry(transition.priceCatalog, transition.stripePriceId);

	if (retainsPlan && !catalogLookup.ok) {
		throw new Error(
			`customer.subscription.updated cannot grant access for ${transition.orgId}: ${catalogLookup.reason}`
		);
	}
	const commercialPlan = retainsPlan && catalogLookup.ok ? catalogLookup.entry.commercialPlan : 'free';
	const cancellationDetails = fallbackCancellationDetails(
		transition,
		transition.cancelAtPeriodEnd || transition.status === 'canceled' ? snapshot : null
	);

	return {
		snapshot: {
			...eventSnapshotBase(transition, 'synced'),
			commercial_plan: commercialPlan,
			stripe_customer_id: transition.stripeCustomerId,
			stripe_subscription_id: transition.stripeSubscriptionId,
			stripe_product_id: transition.stripeProductId,
			stripe_price_id: transition.stripePriceId,
			subscription_status: transition.status,
			collection_status: subscriptionCollectionStatus(transition.status),
			current_period_start: transition.currentPeriodStart,
			current_period_end: transition.currentPeriodEnd,
			cancel_at_period_end: transition.cancelAtPeriodEnd,
			canceled_at: transition.canceledAt,
			...cancellationDetails,
			trial_end: transition.trialEnd
		},
		mirror: {
			tier: commercialPlan,
			stripe_customer_id: transition.stripeCustomerId,
			stripe_subscription_id: legacyOrganizationSubscriptionId(transition.status, transition.stripeSubscriptionId),
			subscription_status: legacyOrganizationStatus(transition.status),
			current_period_end: transition.currentPeriodEnd
		},
		result: `subscription updated for organization ${transition.orgId}`,
		commercialPlan
	};
}

function planSubscriptionDeletedTransition(
	transition: Extract<BillingSnapshotTransition, { kind: 'subscription_deleted' }>,
	snapshot: ExistingBillingSnapshot | null
): { snapshot: BillingSnapshotUpsert; mirror: Record<string, unknown>; result: string } {
	return {
		snapshot: {
			...eventSnapshotBase(transition, 'synced'),
			commercial_plan: 'free',
			stripe_customer_id: snapshot?.stripe_customer_id ?? transition.stripeCustomerId,
			stripe_subscription_id: null,
			stripe_product_id: snapshot?.stripe_product_id ?? null,
			stripe_price_id: snapshot?.stripe_price_id ?? null,
			subscription_status: 'canceled',
			collection_status: 'canceled',
			current_period_start: transition.currentPeriodStart ?? snapshot?.current_period_start ?? null,
			current_period_end: transition.currentPeriodEnd ?? snapshot?.current_period_end ?? null,
			cancel_at_period_end: false,
			canceled_at: transition.canceledAt ?? transition.event.createdAt,
			...fallbackCancellationDetails(transition, snapshot),
			trial_end: snapshot?.trial_end ?? null
		},
		mirror: {
			tier: 'free',
			stripe_subscription_id: null,
			subscription_status: 'canceled',
			current_period_end: null
		},
		result: `subscription deleted for organization ${transition.orgId}`
	};
}

function planPaymentFailedTransition(
	transition: Extract<BillingSnapshotTransition, { kind: 'payment_failed' }>,
	snapshot: ExistingBillingSnapshot | null
): { snapshot: BillingSnapshotUpsert; mirror: Record<string, unknown>; result: string } {
	return {
		snapshot: paymentSnapshot(transition, snapshot, {
			status: 'past_due',
			collectionStatus: 'payment_failed_grace',
			canceledAt: snapshot?.canceled_at ?? null,
			cancellationReason: snapshot?.cancellation_reason ?? null,
			cancellationFeedback: snapshot?.cancellation_feedback ?? null
		}),
		mirror: { subscription_status: 'past_due' },
		result: `payment failure marked past due for organization ${transition.orgId}`
	};
}

function planPaymentSucceededTransition(
	transition: Extract<BillingSnapshotTransition, { kind: 'payment_succeeded' }>,
	snapshot: ExistingBillingSnapshot | null
): { snapshot: BillingSnapshotUpsert; mirror: Record<string, unknown>; result: string } {
	const commercialPlan = snapshot?.commercial_plan ?? transition.fallbackCommercialPlan ?? 'free';
	const subscriptionId =
		snapshot?.stripe_subscription_id ?? transition.fallbackStripeSubscriptionId ?? transition.stripeSubscriptionId;

	return {
		snapshot: paymentSnapshot(transition, snapshot, {
			status: 'active',
			collectionStatus: 'current',
			canceledAt: null,
			cancellationReason: null,
			cancellationFeedback: null
		}),
		mirror: {
			tier: commercialPlan,
			stripe_subscription_id: subscriptionId,
			subscription_status: 'active',
			current_period_end: snapshot?.current_period_end ?? null
		},
		result: `payment success restored billing for organization ${transition.orgId}`
	};
}

function paymentSnapshot(
	transition: Extract<BillingSnapshotTransition, { kind: 'payment_failed' | 'payment_succeeded' }>,
	snapshot: ExistingBillingSnapshot | null,
	input: {
		status: SubscriptionStatus;
		collectionStatus: string;
		canceledAt: string | null;
		cancellationReason: string | null;
		cancellationFeedback: BillingCancellationFeedback | null;
	}
): BillingSnapshotUpsert {
	return {
		...eventSnapshotBase(transition, 'synced'),
		commercial_plan: snapshot?.commercial_plan ?? transition.fallbackCommercialPlan ?? 'free',
		stripe_customer_id: snapshot?.stripe_customer_id ?? transition.fallbackStripeCustomerId,
		stripe_subscription_id:
			snapshot?.stripe_subscription_id ?? transition.fallbackStripeSubscriptionId ?? transition.stripeSubscriptionId,
		stripe_product_id: snapshot?.stripe_product_id ?? null,
		stripe_price_id: snapshot?.stripe_price_id ?? null,
		subscription_status: input.status,
		collection_status: input.collectionStatus,
		current_period_start: snapshot?.current_period_start ?? null,
		current_period_end: snapshot?.current_period_end ?? null,
		cancel_at_period_end: snapshot?.cancel_at_period_end ?? false,
		canceled_at: input.canceledAt,
		cancellation_reason: input.cancellationReason,
		cancellation_feedback: input.cancellationFeedback,
		trial_end: snapshot?.trial_end ?? null
	};
}

function eventSnapshotBase(
	transition: Exclude<BillingSnapshotTransition, { kind: 'immediate_cancellation_requested' }>,
	syncStatus: BillingSyncStatus
): Omit<
	BillingSnapshotUpsert,
	| 'commercial_plan'
	| 'stripe_customer_id'
	| 'stripe_subscription_id'
	| 'stripe_product_id'
	| 'stripe_price_id'
	| 'subscription_status'
	| 'collection_status'
	| 'current_period_start'
	| 'current_period_end'
	| 'cancel_at_period_end'
	| 'canceled_at'
	| 'trial_end'
> {
	return {
		organization_id: transition.orgId,
		source: 'stripe',
		sync_status: syncStatus,
		last_stripe_event_id: transition.event.id,
		last_stripe_event_type: transition.event.type,
		last_stripe_event_created_at: transition.event.createdAt,
		last_processed_at: transition.processedAt ?? new Date().toISOString(),
		drift_detected: false
	};
}

function eventPosition(event: StripeEventFact): BillingEventPosition {
	return {
		eventId: event.id,
		eventType: event.type,
		eventCreatedAt: event.createdAt
	};
}

function snapshotEventPosition(snapshot: ExistingBillingSnapshot | null): BillingEventPosition | undefined {
	if (!snapshot?.last_stripe_event_created_at) return undefined;

	return {
		eventId: snapshot.last_stripe_event_id ?? '',
		eventType: snapshot.last_stripe_event_type ?? '',
		eventCreatedAt: snapshot.last_stripe_event_created_at
	};
}

function superseded(orgId: string, subject: string, reason: string): BillingSnapshotTransitionResult {
	return {
		state: 'superseded',
		result: `${subject} for organization ${orgId} ${reason}`,
		orgId
	};
}

function transitionSubject(
	kind: Exclude<BillingSnapshotTransition['kind'], 'immediate_cancellation_requested'>
): string {
	switch (kind) {
		case 'checkout_completed':
			return 'checkout completion';
		case 'subscription_updated':
			return 'subscription update';
		case 'subscription_deleted':
			return 'subscription deletion';
		case 'payment_failed':
			return 'payment failure';
		case 'payment_succeeded':
			return 'payment success';
	}
}

function retainsCommercialPlan(status: SubscriptionStatus): boolean {
	return status === 'active' || status === 'trialing' || status === 'paused' || status === 'past_due';
}

function subscriptionCollectionStatus(status: SubscriptionStatus): string {
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

function legacyOrganizationStatus(status: SubscriptionStatus): string | null {
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

function fallbackCancellationDetails(
	input: {
		cancellationReason: string | null;
		cancellationFeedback: BillingCancellationFeedback | null;
	},
	fallback: Pick<ExistingBillingSnapshot, 'cancellation_reason' | 'cancellation_feedback'> | null
): { cancellation_reason: string | null; cancellation_feedback: BillingCancellationFeedback | null } {
	return {
		cancellation_reason: input.cancellationReason ?? fallback?.cancellation_reason ?? null,
		cancellation_feedback: input.cancellationFeedback ?? fallback?.cancellation_feedback ?? null
	};
}

function isStaleBillingEvent(
	snapshot: ExistingBillingSnapshot | null,
	eventCreatedAt: string,
	eventId: string
): boolean {
	return (
		!!snapshot &&
		compareStripeEventPosition(
			snapshot.last_stripe_event_created_at,
			snapshot.last_stripe_event_id,
			eventCreatedAt,
			eventId
		) > 0
	);
}

function compareStripeEventPosition(
	leftCreatedAt: string | null,
	leftId: string | null | undefined,
	rightCreatedAt: string,
	rightId: string
): number {
	if (!leftCreatedAt) return -1;
	const leftTime = new Date(leftCreatedAt).getTime();
	const rightTime = new Date(rightCreatedAt).getTime();
	if (leftTime !== rightTime) return leftTime - rightTime;
	return (leftId ?? '').localeCompare(rightId);
}
