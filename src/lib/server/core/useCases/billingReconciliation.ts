import type { BillingSnapshot, SubscriptionStatus, Tier, PriceCatalogEntry } from '$lib/types/subscription';
import { lookupPriceCatalogEntry } from '$lib/server/billing/priceCatalog';
import { legacyOrganizationSubscriptionId } from '$lib/server/billing/subscriptionRetentionPolicy';
import type { SubscriptionPort } from '$lib/server/core/ports';

export interface BillingReconciliationOrganizationRow {
	id: string;
	tier: Tier | null;
	stripe_customer_id: string | null;
	stripe_subscription_id: string | null;
	subscription_status: SubscriptionStatus | null;
	current_period_end: string | null;
}

export interface BillingReconciliationSnapshotRow {
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
	cancel_at_period_end: boolean | null;
	canceled_at: string | null;
	cancellation_reason: string | null;
	cancellation_feedback: BillingSnapshot['cancellationFeedback'];
	trial_end: string | null;
	sync_status: BillingSnapshot['syncStatus'];
	last_stripe_event_id: string | null;
	last_stripe_event_type: string | null;
	last_stripe_event_created_at: string | null;
	last_processed_at: string | null;
	last_reconciled_at: string | null;
	reconciliation_result: string | null;
	drift_detected: boolean | null;
}

export interface BillingReconciliationProviderSubscription {
	id: string;
	customerId: string | null;
	status: SubscriptionStatus;
	priceId: string | null;
	productId: string | null;
	currentPeriodStart: string | null;
	currentPeriodEnd: string | null;
	cancelAtPeriodEnd: boolean;
	canceledAt: string | null;
	trialEnd: string | null;
	metadata: Record<string, string | undefined>;
}

export interface BillingReconciliationProvider {
	retrieveSubscription(subscriptionId: string): Promise<BillingReconciliationProviderSubscription | null>;
	listSubscriptionsForCustomer(customerId: string): Promise<BillingReconciliationProviderSubscription[]>;
}

export type BillingReconciliationSubscriptionPort = Pick<SubscriptionPort, 'invalidateTierCache'>;

export interface BillingReconciliationStore {
	readOrganization(orgId: string): Promise<BillingReconciliationOrganizationRow | null>;
	readSnapshot(orgId: string): Promise<BillingReconciliationSnapshotRow | null>;
	upsertSnapshot(values: Record<string, unknown>): Promise<void>;
	updateSnapshotDiagnostics(
		orgId: string,
		values: {
			last_reconciled_at: string;
			reconciliation_result: string;
			drift_detected: boolean;
			sync_status: BillingSnapshot['syncStatus'];
		}
	): Promise<void>;
	updateOrganizationBillingMirror(orgId: string, values: Record<string, unknown>): Promise<void>;
}

export type BillingReconciliationStatus = 'matched' | 'repaired' | 'failed';

export interface BillingReconciliationResult {
	ok: boolean;
	status: BillingReconciliationStatus;
	result: string;
	driftDetected: boolean;
	diagnostics: string[];
	snapshotUpdated: boolean;
	plannedWrites: string[];
	dryRun: boolean;
	reconciledAt: string;
}

export class BillingReconciliationError extends Error {
	constructor(
		message: string,
		readonly diagnostics: string[]
	) {
		super(message);
		this.name = 'BillingReconciliationError';
	}
}

function isoNow(now: () => Date): string {
	return now().toISOString();
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

function retainsCommercialPlan(status: SubscriptionStatus): boolean {
	return status === 'active' || status === 'trialing' || status === 'paused' || status === 'past_due';
}

function reconciledSubscriptionId(subscription: BillingReconciliationProviderSubscription): string | null {
	return subscription.status === 'canceled' ? null : subscription.id;
}

function providerSnapshotValues(input: {
	orgId: string;
	subscription: BillingReconciliationProviderSubscription;
	commercialPlan: Tier;
	reconciledAt: string;
	driftDetected: boolean;
	result: string;
}): Record<string, unknown> {
	return {
		organization_id: input.orgId,
		source: 'stripe',
		commercial_plan: input.commercialPlan,
		stripe_customer_id: input.subscription.customerId,
		stripe_subscription_id: reconciledSubscriptionId(input.subscription),
		stripe_product_id: input.subscription.productId,
		stripe_price_id: input.subscription.priceId,
		subscription_status: input.subscription.status,
		collection_status: subscriptionCollectionStatus(input.subscription.status),
		current_period_start: input.subscription.currentPeriodStart,
		current_period_end: input.subscription.currentPeriodEnd,
		cancel_at_period_end: input.subscription.cancelAtPeriodEnd,
		canceled_at: input.subscription.canceledAt,
		trial_end: input.subscription.trialEnd,
		sync_status: 'synced',
		last_reconciled_at: input.reconciledAt,
		reconciliation_result: input.result,
		drift_detected: input.driftDetected
	};
}

function legacySnapshotValues(input: {
	org: BillingReconciliationOrganizationRow;
	reconciledAt: string;
}): Record<string, unknown> | null {
	if (!input.org.stripe_customer_id && !input.org.stripe_subscription_id) return null;
	if (input.org.tier !== 'team' && input.org.tier !== 'unit') return null;

	const status = input.org.subscription_status;
	if (
		status !== 'active' &&
		status !== 'trialing' &&
		status !== 'past_due' &&
		status !== 'unpaid' &&
		status !== 'canceled' &&
		status !== 'incomplete' &&
		status !== 'incomplete_expired' &&
		status !== 'paused'
	) {
		return null;
	}

	return {
		organization_id: input.org.id,
		source: 'legacy_organization',
		commercial_plan: input.org.tier ?? 'free',
		stripe_customer_id: input.org.stripe_customer_id,
		stripe_subscription_id: input.org.stripe_subscription_id,
		stripe_product_id: null,
		stripe_price_id: null,
		subscription_status: status,
		collection_status: subscriptionCollectionStatus(status),
		current_period_start: null,
		current_period_end: status === 'canceled' ? null : input.org.current_period_end,
		cancel_at_period_end: false,
		canceled_at: null,
		trial_end: null,
		sync_status: 'needs_reconciliation',
		last_reconciled_at: input.reconciledAt,
		reconciliation_result: 'legacy_snapshot_seeded_for_stripe_review',
		drift_detected: true
	};
}

function isInactiveFreeLegacyOrg(org: BillingReconciliationOrganizationRow): boolean {
	return org.tier === 'free' && (org.subscription_status === null || org.subscription_status === 'canceled');
}

function diffSnapshot(snapshot: BillingReconciliationSnapshotRow | null, expected: Record<string, unknown>): string[] {
	if (!snapshot) return ['missing_local_snapshot'];
	const checks: Array<[keyof BillingReconciliationSnapshotRow, string]> = [
		['source', 'source'],
		['commercial_plan', 'commercial_plan'],
		['stripe_customer_id', 'stripe_customer_id'],
		['stripe_subscription_id', 'stripe_subscription_id'],
		['stripe_product_id', 'stripe_product_id'],
		['stripe_price_id', 'stripe_price_id'],
		['subscription_status', 'subscription_status'],
		['collection_status', 'collection_status'],
		['current_period_start', 'current_period_start'],
		['current_period_end', 'current_period_end'],
		['cancel_at_period_end', 'cancel_at_period_end'],
		['canceled_at', 'canceled_at'],
		['trial_end', 'trial_end'],
		['sync_status', 'sync_status']
	];

	const timestampFields = new Set<keyof BillingReconciliationSnapshotRow>([
		'current_period_start',
		'current_period_end',
		'canceled_at',
		'trial_end'
	]);

	return checks
		.filter(([field, key]) => {
			const actual = snapshot[field] ?? null;
			const expectedValue = expected[key] ?? null;
			if (timestampFields.has(field)) return !sameTimestampValue(actual, expectedValue);
			return actual !== expectedValue;
		})
		.map(([field]) => field);
}

function sameTimestampValue(actual: unknown, expected: unknown): boolean {
	if (actual === expected) return true;
	if (actual === null || expected === null) return actual === expected;
	if (typeof actual !== 'string' || typeof expected !== 'string') return false;

	const actualMs = Date.parse(actual);
	const expectedMs = Date.parse(expected);
	return Number.isFinite(actualMs) && Number.isFinite(expectedMs) && actualMs === expectedMs;
}

function pickProviderSubscription(
	subscriptions: BillingReconciliationProviderSubscription[]
): BillingReconciliationProviderSubscription | null {
	const preferredStatuses = new Set<SubscriptionStatus>([
		'active',
		'trialing',
		'past_due',
		'unpaid',
		'paused',
		'incomplete'
	]);
	return subscriptions.find((subscription) => preferredStatuses.has(subscription.status)) ?? subscriptions[0] ?? null;
}

async function resolveProviderSubscription(input: {
	provider: BillingReconciliationProvider;
	org: BillingReconciliationOrganizationRow;
	snapshot: BillingReconciliationSnapshotRow | null;
}): Promise<BillingReconciliationProviderSubscription | null> {
	const subscriptionId = input.snapshot?.stripe_subscription_id ?? input.org.stripe_subscription_id;
	const customerId = input.snapshot?.stripe_customer_id ?? input.org.stripe_customer_id;
	if (subscriptionId) {
		const subscription = await input.provider.retrieveSubscription(subscriptionId);
		if (subscription) return subscription;
	}

	if (!customerId) return null;

	return pickProviderSubscription(await input.provider.listSubscriptionsForCustomer(customerId));
}

function validateProviderSubscription(input: {
	orgId: string;
	subscription: BillingReconciliationProviderSubscription;
	priceCatalog: PriceCatalogEntry[];
}): { commercialPlan: Tier } {
	const metadataOrgId = input.subscription.metadata.orgId;
	if (!metadataOrgId) {
		throw new BillingReconciliationError('Stripe subscription is missing orgId metadata.', ['missing_org_metadata']);
	}
	if (metadataOrgId !== input.orgId) {
		throw new BillingReconciliationError('Stripe subscription orgId metadata does not match this organization.', [
			'metadata_org_mismatch'
		]);
	}

	const shouldRetainCommercialPlan = retainsCommercialPlan(input.subscription.status);

	if (!shouldRetainCommercialPlan) {
		return { commercialPlan: 'free' };
	}

	const catalogLookup = lookupPriceCatalogEntry(input.priceCatalog, input.subscription.priceId);
	if (!catalogLookup.ok) {
		throw new BillingReconciliationError(
			`Stripe subscription price is not in the local catalog: ${catalogLookup.reason}.`,
			[catalogLookup.reason]
		);
	}

	return { commercialPlan: catalogLookup.entry.commercialPlan };
}

async function markFailed(input: {
	store: BillingReconciliationStore;
	orgId: string;
	reconciledAt: string;
	result: string;
	diagnostics: string[];
	writeDiagnostics?: boolean;
	dryRun?: boolean;
}): Promise<BillingReconciliationResult> {
	const dryRun = input.dryRun ?? false;
	const wouldWriteDiagnostics = input.writeDiagnostics ?? true;

	if (wouldWriteDiagnostics && !dryRun) {
		await input.store.updateSnapshotDiagnostics(input.orgId, {
			last_reconciled_at: input.reconciledAt,
			reconciliation_result: input.result,
			drift_detected: true,
			sync_status: 'needs_reconciliation'
		});
	}

	return {
		ok: false,
		status: 'failed',
		result: input.result,
		driftDetected: true,
		diagnostics: input.diagnostics,
		snapshotUpdated: false,
		plannedWrites: wouldWriteDiagnostics ? ['organization_billing_snapshots.diagnostics'] : [],
		dryRun,
		reconciledAt: input.reconciledAt
	};
}

export async function reconcileOrganizationBilling(input: {
	orgId: string;
	store: BillingReconciliationStore;
	provider: BillingReconciliationProvider;
	subscription: BillingReconciliationSubscriptionPort;
	priceCatalog: PriceCatalogEntry[];
	now?: () => Date;
	dryRun?: boolean;
}): Promise<BillingReconciliationResult> {
	const now = input.now ?? (() => new Date());
	const dryRun = input.dryRun ?? false;
	const reconciledAt = isoNow(now);
	const org = await input.store.readOrganization(input.orgId);
	if (!org) {
		return markFailed({
			store: input.store,
			orgId: input.orgId,
			reconciledAt,
			result: 'Organization not found.',
			diagnostics: ['organization_not_found'],
			writeDiagnostics: false,
			dryRun
		});
	}

	const snapshot = await input.store.readSnapshot(input.orgId);
	let subscription: BillingReconciliationProviderSubscription | null;
	try {
		subscription = await resolveProviderSubscription({
			provider: input.provider,
			org,
			snapshot
		});
	} catch (err) {
		return markFailed({
			store: input.store,
			orgId: input.orgId,
			reconciledAt,
			result: 'Stripe provider read failed.',
			diagnostics: [err instanceof Error ? err.message : 'provider_error'],
			dryRun
		});
	}

	if (!subscription) {
		if (snapshot?.source === 'legacy_organization' && snapshot.sync_status === 'needs_reconciliation') {
			return markFailed({
				store: input.store,
				orgId: input.orgId,
				reconciledAt,
				result: 'Legacy billing snapshot still needs Stripe review.',
				diagnostics: ['missing_stripe_subscription', 'legacy_organization_snapshot_needs_review'],
				writeDiagnostics: false,
				dryRun
			});
		}

		if (isInactiveFreeLegacyOrg(org)) {
			return {
				ok: true,
				status: 'matched',
				result: 'No active billing snapshot required for inactive free legacy organization.',
				driftDetected: false,
				diagnostics: [],
				snapshotUpdated: false,
				plannedWrites: [],
				dryRun,
				reconciledAt
			};
		}

		const values = legacySnapshotValues({ org, reconciledAt });
		if (values) {
			if (!dryRun) {
				await input.store.upsertSnapshot(values);
			}

			return {
				ok: false,
				status: 'failed',
				result: 'legacy_snapshot_seeded_for_stripe_review',
				driftDetected: true,
				diagnostics: ['missing_stripe_subscription', 'legacy_organization_snapshot_seed'],
				snapshotUpdated: !dryRun,
				plannedWrites: ['organization_billing_snapshots.legacy_seed'],
				dryRun,
				reconciledAt
			};
		}

		return markFailed({
			store: input.store,
			orgId: input.orgId,
			reconciledAt,
			result: 'No Stripe subscription was found for this organization.',
			diagnostics: ['missing_subscription'],
			dryRun
		});
	}

	let commercialPlan: Tier;
	try {
		({ commercialPlan } = validateProviderSubscription({
			orgId: input.orgId,
			subscription,
			priceCatalog: input.priceCatalog
		}));
	} catch (err) {
		if (err instanceof BillingReconciliationError) {
			return markFailed({
				store: input.store,
				orgId: input.orgId,
				reconciledAt,
				result: err.message,
				diagnostics: err.diagnostics,
				dryRun
			});
		}
		throw err;
	}

	const preliminaryValues = providerSnapshotValues({
		orgId: input.orgId,
		subscription,
		commercialPlan,
		reconciledAt,
		driftDetected: false,
		result: 'matched'
	});
	const driftFields = diffSnapshot(snapshot, preliminaryValues);
	const driftDetected = driftFields.length > 0;
	const result = driftDetected ? `repaired_drift:${driftFields.join(',')}` : 'matched';
	const values = providerSnapshotValues({
		orgId: input.orgId,
		subscription,
		commercialPlan,
		reconciledAt,
		driftDetected,
		result
	});

	const plannedWrites = driftDetected
		? ['organization_billing_snapshots', 'organizations.billing_mirror', 'tier_cache_invalidation']
		: [];

	if (!dryRun && driftDetected) {
		await input.store.upsertSnapshot(values);
		await input.store.updateOrganizationBillingMirror(input.orgId, {
			tier: commercialPlan,
			stripe_customer_id: subscription.customerId,
			stripe_subscription_id: legacyOrganizationSubscriptionId(subscription.status, subscription.id),
			subscription_status: legacyOrganizationStatus(subscription.status),
			current_period_end: subscription.status === 'canceled' ? null : subscription.currentPeriodEnd
		});
		await input.subscription.invalidateTierCache();
	}

	return {
		ok: true,
		status: driftDetected ? 'repaired' : 'matched',
		result,
		driftDetected,
		diagnostics: driftFields,
		snapshotUpdated: driftDetected,
		plannedWrites,
		dryRun,
		reconciledAt
	};
}
