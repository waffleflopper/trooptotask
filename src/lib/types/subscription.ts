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
}

export const TIER_CONFIG: Record<Tier, TierConfig> = {
	free: {
		name: 'Free',
		personnelCap: 20,
		maxOrgsOwned: 1,
		activeUserCap: 2,
		bulkExportsPerMonth: 3,
		priceMonthly: 0
	},
	team: {
		name: 'Team',
		personnelCap: 80,
		maxOrgsOwned: 1,
		activeUserCap: null,
		bulkExportsPerMonth: 10,
		priceMonthly: 499 // cents
	},
	unit: {
		name: 'Unit',
		personnelCap: 500,
		maxOrgsOwned: 1,
		activeUserCap: null,
		bulkExportsPerMonth: null,
		priceMonthly: 1099 // cents
	}
};

export type PublicPlanKey = Tier | 'enterprise';

export interface PublicPlanPresentation {
	key: PublicPlanKey;
	name: string;
	priceMonthly: number | null;
	priceLabel: string;
	priceSuffix: string | null;
	personnelCapacity: string;
	accountUsers: string;
	exportAllowance: string;
	launchAvailability: string;
	featured?: boolean;
}

function formatMonthlyPrice(cents: number): string {
	return cents === 0 ? '$0' : `$${(cents / 100).toFixed(2)}`;
}

function formatPersonnelCapacity(cap: number): string {
	return `Up to ${cap} personnel`;
}

function formatActiveUserCap(cap: number | null): string {
	return cap === null ? 'Unlimited account users' : `Up to ${cap} active account users`;
}

function formatExportAllowance(exportsPerMonth: number | null): string {
	return exportsPerMonth === null ? 'Unlimited exports' : `${exportsPerMonth} exports per month`;
}

export const PUBLIC_PLAN_PRESENTATION: PublicPlanPresentation[] = [
	{
		key: 'free',
		name: TIER_CONFIG.free.name,
		priceMonthly: TIER_CONFIG.free.priceMonthly,
		priceLabel: formatMonthlyPrice(TIER_CONFIG.free.priceMonthly),
		priceSuffix: null,
		personnelCapacity: formatPersonnelCapacity(TIER_CONFIG.free.personnelCap),
		accountUsers: formatActiveUserCap(TIER_CONFIG.free.activeUserCap),
		exportAllowance: formatExportAllowance(TIER_CONFIG.free.bulkExportsPerMonth),
		launchAvailability: 'Reviewed access'
	},
	{
		key: 'team',
		name: TIER_CONFIG.team.name,
		priceMonthly: TIER_CONFIG.team.priceMonthly,
		priceLabel: formatMonthlyPrice(TIER_CONFIG.team.priceMonthly),
		priceSuffix: '/mo',
		personnelCapacity: formatPersonnelCapacity(TIER_CONFIG.team.personnelCap),
		accountUsers: formatActiveUserCap(TIER_CONFIG.team.activeUserCap),
		exportAllowance: formatExportAllowance(TIER_CONFIG.team.bulkExportsPerMonth),
		launchAvailability: 'Reviewed access now; paid billing when enabled',
		featured: true
	},
	{
		key: 'unit',
		name: TIER_CONFIG.unit.name,
		priceMonthly: TIER_CONFIG.unit.priceMonthly,
		priceLabel: formatMonthlyPrice(TIER_CONFIG.unit.priceMonthly),
		priceSuffix: '/mo',
		personnelCapacity: formatPersonnelCapacity(TIER_CONFIG.unit.personnelCap),
		accountUsers: formatActiveUserCap(TIER_CONFIG.unit.activeUserCap),
		exportAllowance: formatExportAllowance(TIER_CONFIG.unit.bulkExportsPerMonth),
		launchAvailability: 'Reviewed access now; paid billing when enabled'
	},
	{
		key: 'enterprise',
		name: 'Enterprise',
		priceMonthly: null,
		priceLabel: 'Contact us',
		priceSuffix: null,
		personnelCapacity: 'Larger formations',
		accountUsers: 'Unlimited account users',
		exportAllowance: 'Custom capacity and support terms',
		launchAvailability: 'Support-led onboarding'
	}
];
