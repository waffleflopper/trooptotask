import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminContext } from './adminAdapter';
import { createSupabaseDataStore } from './supabaseDataStore';
import { createSupabasePlatformMetrics } from './supabasePlatformMetrics';
import {
	createPlatformOrganizationLedger,
	type PlatformOrganizationLedger,
	type PlatformOrganizationLedgerBaseRow,
	type PlatformOrganizationLedgerPage,
	type PlatformOrganizationLedgerQuery,
	type PlatformOrganizationLedgerStore
} from '$lib/server/core/useCases/platformOrganizationLedger';
import { buildPlanAdminDiagnostics } from '$lib/server/core/useCases/planAdminDiagnostics';
import { readOrganizationPlanUsage } from '$lib/server/core/useCases/organizationPlanUsage';
import { readEffectivePlanPolicy } from '$lib/server/core/useCases/planPolicy';
import type { BillingSnapshot } from '$lib/types/subscription';
import type { Tier } from '$lib/types/subscription';

const ORGANIZATION_SELECT = 'id, name, tier, gift_tier, gift_expires_at, suspended_at, created_at';
const BILLING_SNAPSHOT_SELECT =
	'organization_id, source, commercial_plan, stripe_customer_id, stripe_subscription_id, stripe_product_id, stripe_price_id, subscription_status, collection_status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, cancellation_reason, cancellation_feedback, trial_end, sync_status, last_stripe_event_id, last_stripe_event_type, last_stripe_event_created_at, last_processed_at, last_reconciled_at, reconciliation_result, drift_detected';

type SupabasePageResponse<T> = {
	data: T[] | null;
	count: number | null;
	error: unknown;
};

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
};

function throwIfSupabaseError(error: unknown): void {
	if (!error) return;
	throw error;
}

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
		cancellationReason: row.cancellation_reason,
		cancellationFeedback: row.cancellation_feedback,
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

export function createSupabasePlatformOrganizationLedgerStore(
	supabase: SupabaseClient
): PlatformOrganizationLedgerStore {
	return {
		async listOrganizationsPage(query: PlatformOrganizationLedgerQuery): Promise<PlatformOrganizationLedgerPage> {
			let builder = supabase
				.from('organizations')
				.select(ORGANIZATION_SELECT, { count: 'exact' })
				.order('created_at', { ascending: false });

			if (query.q) {
				builder = builder.ilike('name', `%${query.q}%`);
			}

			const response = (await builder.range(
				query.from,
				query.to
			)) as SupabasePageResponse<PlatformOrganizationLedgerBaseRow>;
			throwIfSupabaseError(response.error);

			return {
				organizations: response.data ?? [],
				totalCount: response.count ?? 0
			};
		},

		async listBillingSnapshotsByOrganization(organizationIds: string[]): Promise<Map<string, BillingSnapshot>> {
			const normalizedIds = [...new Set(organizationIds.filter(Boolean))];
			if (normalizedIds.length === 0) return new Map();

			const response = (await supabase
				.from('organization_billing_snapshots')
				.select(BILLING_SNAPSHOT_SELECT)
				.in('organization_id', normalizedIds)
				.order('organization_id')
				.range(0, normalizedIds.length - 1)) as SupabasePageResponse<AdminBillingSnapshotRow>;
			throwIfSupabaseError(response.error);

			return new Map(
				(response.data ?? []).map((row) => {
					const snapshot = mapAdminBillingSnapshot(row);
					return [row.organization_id, snapshot] as const;
				})
			);
		}
	};
}

export function createSupabasePlatformOrganizationLedger(ctx: AdminContext): PlatformOrganizationLedger {
	const dataStore = createSupabaseDataStore(ctx.adminClient);

	return createPlatformOrganizationLedger({
		store: createSupabasePlatformOrganizationLedgerStore(ctx.adminClient),
		metrics: createSupabasePlatformMetrics(ctx),
		adminRole: ctx.adminUser.role,
		async readPlanDiagnostics(organizationId) {
			const [planPolicy, planUsage] = await Promise.all([
				readEffectivePlanPolicy({
					store: dataStore,
					auth: { orgId: organizationId }
				}),
				readOrganizationPlanUsage({
					store: dataStore,
					auth: { orgId: organizationId }
				})
			]);
			return buildPlanAdminDiagnostics(planPolicy, planUsage);
		}
	});
}
