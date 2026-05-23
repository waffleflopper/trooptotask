import { isBillingEnabled } from '$lib/config/billing';
import type { DataStore } from '$lib/server/core/ports';
import type {
	BillingSnapshot,
	BillingCancellationSummary,
	BillingSnapshotSource,
	BillingSyncStatus,
	SubscriptionStatus,
	Tier
} from '$lib/types/subscription';
import { compareCommercialPlans } from '$lib/server/billing/priceCatalog';

interface BillingStatePorts {
	store: DataStore;
	auth: { orgId: string };
}

interface OrganizationBillingSnapshotRow {
	organization_id: string;
	source: BillingSnapshotSource;
	commercial_plan: Tier;
	stripe_customer_id: string | null;
	stripe_subscription_id: string | null;
	stripe_product_id: string | null;
	stripe_price_id: string | null;
	subscription_status: SubscriptionStatus | null;
	collection_status: string | null;
	current_period_start: string | null;
	current_period_end: string | null;
	cancel_at_period_end: boolean | null;
	canceled_at: string | null;
	trial_end: string | null;
	sync_status: BillingSyncStatus;
	last_stripe_event_id: string | null;
	last_stripe_event_type: string | null;
	last_stripe_event_created_at: string | null;
	last_processed_at: string | null;
	last_reconciled_at: string | null;
	reconciliation_result: string | null;
	drift_detected: boolean | null;
}

interface OrganizationBillingFallbackRow {
	id: string;
	tier: Tier | null;
	stripe_customer_id: string | null;
	stripe_subscription_id: string | null;
	subscription_status: SubscriptionStatus | null;
	current_period_end: string | null;
	gift_tier: Tier | null;
	gift_expires_at: string | null;
}

function isGiftActive(org: Pick<OrganizationBillingFallbackRow, 'gift_tier' | 'gift_expires_at'>): boolean {
	return !!(org.gift_tier && org.gift_expires_at && new Date(org.gift_expires_at).getTime() > Date.now());
}

function mapSnapshotRow(
	row: OrganizationBillingSnapshotRow,
	gift: Pick<OrganizationBillingFallbackRow, 'gift_tier' | 'gift_expires_at'>
): BillingSnapshot {
	return {
		organizationId: row.organization_id,
		source: row.source,
		commercialPlan: row.commercial_plan,
		stripeCustomerId: row.stripe_customer_id,
		stripeSubscriptionId: row.stripe_subscription_id,
		stripeProductId: row.stripe_product_id,
		stripePriceId: row.stripe_price_id,
		subscriptionStatus: row.subscription_status,
		collectionStatus: row.collection_status,
		currentPeriodStart: row.current_period_start,
		currentPeriodEnd: row.current_period_end,
		cancelAtPeriodEnd: row.cancel_at_period_end ?? false,
		canceledAt: row.canceled_at,
		trialEnd: row.trial_end,
		syncStatus: row.sync_status,
		lastStripeEventId: row.last_stripe_event_id,
		lastStripeEventType: row.last_stripe_event_type,
		lastStripeEventCreatedAt: row.last_stripe_event_created_at,
		lastProcessedAt: row.last_processed_at,
		lastReconciledAt: row.last_reconciled_at,
		reconciliationResult: row.reconciliation_result,
		driftDetected: row.drift_detected ?? false,
		giftTier: gift.gift_tier,
		giftExpiresAt: gift.gift_expires_at
	};
}

function emptySnapshot(orgId: string): BillingSnapshot {
	return {
		organizationId: orgId,
		source: 'legacy_organization',
		commercialPlan: 'free',
		stripeCustomerId: null,
		stripeSubscriptionId: null,
		stripeProductId: null,
		stripePriceId: null,
		subscriptionStatus: null,
		collectionStatus: null,
		currentPeriodStart: null,
		currentPeriodEnd: null,
		cancelAtPeriodEnd: false,
		canceledAt: null,
		trialEnd: null,
		syncStatus: 'not_configured',
		lastStripeEventId: null,
		lastStripeEventType: null,
		lastStripeEventCreatedAt: null,
		lastProcessedAt: null,
		lastReconciledAt: null,
		reconciliationResult: null,
		driftDetected: false,
		giftTier: null,
		giftExpiresAt: null
	};
}

function billingDisabledSnapshot(orgId: string): BillingSnapshot {
	return {
		...emptySnapshot(orgId),
		source: 'billing_disabled',
		commercialPlan: 'unit',
		syncStatus: 'billing_disabled'
	};
}

function giftSnapshot(org: OrganizationBillingFallbackRow, base: BillingSnapshot): BillingSnapshot {
	const giftTier = org.gift_tier ?? 'free';
	return {
		...base,
		source: 'gift',
		commercialPlan: compareCommercialPlans(giftTier, base.commercialPlan) > 0 ? giftTier : base.commercialPlan,
		syncStatus: base.syncStatus,
		giftTier,
		giftExpiresAt: org.gift_expires_at
	};
}

function legacyOrganizationSnapshot(org: OrganizationBillingFallbackRow): BillingSnapshot {
	return {
		...emptySnapshot(org.id),
		source: 'legacy_organization',
		commercialPlan: org.tier ?? 'free',
		stripeCustomerId: org.stripe_customer_id,
		stripeSubscriptionId: org.stripe_subscription_id,
		subscriptionStatus: org.subscription_status,
		currentPeriodEnd: org.current_period_end,
		syncStatus: org.stripe_subscription_id ? 'needs_reconciliation' : 'not_configured',
		giftTier: org.gift_tier,
		giftExpiresAt: org.gift_expires_at
	};
}

export async function readCurrentBillingSnapshot(ports: BillingStatePorts): Promise<BillingSnapshot> {
	if (!isBillingEnabled) {
		return billingDisabledSnapshot(ports.auth.orgId);
	}

	const org = await ports.store.findOne<OrganizationBillingFallbackRow>(
		'organizations',
		ports.auth.orgId,
		{},
		'id, tier, stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end, gift_tier, gift_expires_at'
	);

	const snapshotRow = await ports.store.findOne<OrganizationBillingSnapshotRow>(
		'organization_billing_snapshots',
		ports.auth.orgId,
		{},
		'organization_id, source, commercial_plan, stripe_customer_id, stripe_subscription_id, stripe_product_id, stripe_price_id, subscription_status, collection_status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, trial_end, sync_status, last_stripe_event_id, last_stripe_event_type, last_stripe_event_created_at, last_processed_at, last_reconciled_at, reconciliation_result, drift_detected'
	);

	const base = snapshotRow
		? mapSnapshotRow(snapshotRow, {
				gift_tier: org?.gift_tier ?? null,
				gift_expires_at: org?.gift_expires_at ?? null
			})
		: org
			? legacyOrganizationSnapshot(org)
			: emptySnapshot(ports.auth.orgId);

	if (org && isGiftActive(org)) {
		return giftSnapshot(org, base);
	}

	return base;
}

export function summarizeBillingCancellation(snapshot: BillingSnapshot): BillingCancellationSummary {
	const status = snapshot.subscriptionStatus;
	const currentPeriodEnd = snapshot.currentPeriodEnd;
	const canceledAt = snapshot.canceledAt;

	if (status === 'canceled') {
		return {
			state: 'canceled',
			label: 'Canceled',
			description: currentPeriodEnd
				? 'Subscription has ended. The paid-through date is retained for support reference.'
				: 'Subscription has ended.',
			currentPeriodEnd,
			canceledAt
		};
	}

	if (snapshot.cancelAtPeriodEnd && currentPeriodEnd) {
		return {
			state: 'canceling_at_period_end',
			label: 'Cancels at period end',
			description:
				'Paid access remains active until the paid-through date unless Stripe reports an earlier terminal state.',
			currentPeriodEnd,
			canceledAt
		};
	}

	if (snapshot.cancelAtPeriodEnd) {
		return {
			state: 'canceling_at_period_end',
			label: 'Cancellation scheduled',
			description: 'Stripe reports cancellation at period end, but the paid-through date has not synced yet.',
			currentPeriodEnd,
			canceledAt
		};
	}

	return {
		state: 'none',
		label: 'Not scheduled',
		description: 'No cancellation is currently scheduled in the billing snapshot.',
		currentPeriodEnd,
		canceledAt
	};
}
