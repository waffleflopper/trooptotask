import type { PageServerLoad } from './$types';
import { loadWithAdminContext } from '$lib/server/adapters/adminAdapter';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination';
import { TIER_CONFIG, type Tier } from '$lib/types/subscription';
import { summarizeBillingCancellation } from '$lib/server/core/useCases/billingState';
import type { BillingSnapshot } from '$lib/types/subscription';
import {
	type AdminMetricsClient,
	displayOwnerMembership,
	fetchOwnerMembershipsByOrganization,
	fetchPersonnelCountsByOrganization
} from '../adminOrganizationMetrics.server';

function getPersonnelCapForTier(tier: string): number | null {
	const config = TIER_CONFIG[tier as Tier];
	if (!config) return null;
	return config.personnelCap === Infinity ? null : config.personnelCap;
}

type AdminBillingSnapshotRow = {
	organization_id: string;
	source: BillingSnapshot['source'];
	commercial_plan: Tier;
	stripe_customer_id: string | null;
	stripe_subscription_id: string | null;
	stripe_product_id: string | null;
	stripe_price_id: string | null;
	subscription_status: BillingSnapshot['subscriptionStatus'];
	collection_status: string | null;
	current_period_start: string | null;
	current_period_end: string | null;
	cancel_at_period_end: boolean | null;
	canceled_at: string | null;
	trial_end: string | null;
	sync_status: BillingSnapshot['syncStatus'];
	last_stripe_event_id: string | null;
	last_stripe_event_type: string | null;
	last_stripe_event_created_at: string | null;
	last_processed_at: string | null;
	last_reconciled_at: string | null;
	reconciliation_result: string | null;
	drift_detected: boolean | null;
};

function mapAdminBillingSnapshot(row: AdminBillingSnapshotRow): BillingSnapshot {
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
		giftTier: null,
		giftExpiresAt: null
	};
}

export const load: PageServerLoad = loadWithAdminContext({
	page: 'subscriptions',
	fn: async (ctx) => {
		const { adminClient } = ctx;

		const { data: orgs, error: orgsError } = await selectAllSupabaseRows<{
			id: string;
			name: string;
			tier: string | null;
			gift_tier: string | null;
			gift_expires_at: string | null;
			suspended_at: string | null;
			created_at: string;
		}>(
			(from, to) =>
				adminClient
					.from('organizations')
					.select('id, name, tier, gift_tier, gift_expires_at, suspended_at, created_at')
					.order('created_at', { ascending: false })
					.range(from, to) as unknown as Promise<{
					data:
						| {
								id: string;
								name: string;
								tier: string | null;
								gift_tier: string | null;
								gift_expires_at: string | null;
								suspended_at: string | null;
								created_at: string;
						  }[]
						| null;
					error: unknown;
				}>
		);

		if (orgsError) {
			console.error('Admin subscriptions query failed:', orgsError);
		}

		const orgIds = (orgs ?? []).map((org) => org.id);
		const metricsClient = adminClient as unknown as AdminMetricsClient;
		const [personnelCounts, ownerMemberships, snapshotRows] = await Promise.all([
			fetchPersonnelCountsByOrganization(metricsClient, orgIds),
			fetchOwnerMembershipsByOrganization(metricsClient, orgIds),
			orgIds.length
				? selectAllSupabaseRows<AdminBillingSnapshotRow>(
						(from, to) =>
							adminClient
								.from('organization_billing_snapshots')
								.select(
									'organization_id, source, commercial_plan, stripe_customer_id, stripe_subscription_id, stripe_product_id, stripe_price_id, subscription_status, collection_status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, trial_end, sync_status, last_stripe_event_id, last_stripe_event_type, last_stripe_event_created_at, last_processed_at, last_reconciled_at, reconciliation_result, drift_detected'
								)
								.in('organization_id', orgIds)
								.order('organization_id')
								.range(from, to) as unknown as Promise<{ data: AdminBillingSnapshotRow[] | null; error: unknown }>
					)
				: Promise.resolve({ data: [], error: null })
		]);
		const billingDiagnosticsError = !!snapshotRows.error;
		if (billingDiagnosticsError) {
			console.error('Admin billing snapshots query failed:', snapshotRows.error);
		}
		const snapshotsByOrgId = new Map(
			(snapshotRows.data ?? []).map((row) => {
				const snapshot = mapAdminBillingSnapshot(row);
				return [row.organization_id, snapshot] as const;
			})
		);

		const enrichedOrgs = (orgs ?? []).map((org) => {
			const ownerEmail = displayOwnerMembership(ownerMemberships.get(org.id));
			const billingSnapshot = snapshotsByOrgId.get(org.id) ?? null;

			const effectiveTier = (org.gift_tier ?? org.tier ?? 'free') as string;

			return {
				...org,
				effectiveTier,
				personnelCount: personnelCounts.get(org.id) ?? 0,
				personnelCap: getPersonnelCapForTier(effectiveTier),
				ownerEmail,
				isGifted: !!org.gift_tier,
				isSuspended: !!org.suspended_at,
				billingSnapshot,
				cancellationSummary: billingSnapshot ? summarizeBillingCancellation(billingSnapshot) : null
			};
		});

		return { subscriptions: enrichedOrgs, billingDiagnosticsError };
	}
});
