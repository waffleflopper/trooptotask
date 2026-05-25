export type Tier = 'free' | 'team' | 'unit';
export type TierSource = 'subscription' | 'gift' | 'default' | 'billing_disabled';
export type SubscriptionStatus =
	| 'active'
	| 'trialing'
	| 'canceled'
	| 'past_due'
	| 'unpaid'
	| 'incomplete'
	| 'incomplete_expired'
	| 'paused';
export type BillingSnapshotSource = 'stripe' | 'gift' | 'billing_disabled' | 'legacy_organization';
export type BillingSyncStatus = 'not_configured' | 'synced' | 'pending' | 'needs_reconciliation' | 'billing_disabled';
export type ReadOnlyReason = 'payment_failure' | 'billing_state' | 'personnel_limit';
export type BillingCancellationFeedback =
	| 'customer_service'
	| 'low_quality'
	| 'missing_features'
	| 'other'
	| 'switched_service'
	| 'too_complex'
	| 'too_expensive'
	| 'unused';

export interface BillingSnapshot {
	organizationId: string;
	source: BillingSnapshotSource;
	commercialPlan: Tier;
	stripeCustomerId: string | null;
	stripeSubscriptionId: string | null;
	stripeProductId: string | null;
	stripePriceId: string | null;
	subscriptionStatus: SubscriptionStatus | null;
	collectionStatus: string | null;
	currentPeriodStart: string | null;
	currentPeriodEnd: string | null;
	cancelAtPeriodEnd: boolean;
	canceledAt: string | null;
	cancellationReason: string | null;
	cancellationFeedback: BillingCancellationFeedback | null;
	trialEnd: string | null;
	syncStatus: BillingSyncStatus;
	lastStripeEventId: string | null;
	lastStripeEventType: string | null;
	lastStripeEventCreatedAt: string | null;
	lastProcessedAt: string | null;
	lastReconciledAt: string | null;
	reconciliationResult: string | null;
	driftDetected: boolean;
	giftTier: Tier | null;
	giftExpiresAt: string | null;
}

export type BillingCancellationState = 'none' | 'canceling_at_period_end' | 'canceled';

export interface BillingCancellationSummary {
	state: BillingCancellationState;
	label: string;
	description: string;
	currentPeriodEnd: string | null;
	canceledAt: string | null;
}

export interface PriceCatalogEntry {
	priceId: string;
	commercialPlan: Exclude<Tier, 'free'>;
	stripeProductId: string | null;
	activeForCheckout: boolean;
}

export interface EffectiveTier {
	tier: Tier;
	source: TierSource;
	personnelCount: number;
	personnelCap: number;
	isReadOnly: boolean;
	readOnlyReason: ReadOnlyReason | null;
	giftExpiresAt: string | null;
	giftTier: Tier | null;
}

export interface TierConfig {
	name: string;
	personnelCap: number;
	maxOrgsOwned: number;
	activeUserCap: number | null;
	bulkExportsPerMonth: number | null;
	priceMonthly: number;
	featureKeys: string[];
}

export const TIER_CONFIG: Record<Tier, TierConfig> = {
	free: {
		name: 'Free',
		personnelCap: 20,
		maxOrgsOwned: 1,
		activeUserCap: 2,
		bulkExportsPerMonth: 3,
		priceMonthly: 0,
		featureKeys: []
	},
	team: {
		name: 'Team',
		personnelCap: 80,
		maxOrgsOwned: 1,
		activeUserCap: null,
		bulkExportsPerMonth: 10,
		priceMonthly: 500, // cents
		featureKeys: []
	},
	unit: {
		name: 'Unit',
		personnelCap: 500,
		maxOrgsOwned: 1,
		activeUserCap: null,
		bulkExportsPerMonth: null,
		priceMonthly: 1200, // cents
		featureKeys: ['experimental.ai.chat']
	}
};
