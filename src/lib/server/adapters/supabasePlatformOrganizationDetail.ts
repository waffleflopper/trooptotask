import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminContext } from './adminAdapter';
import { createSupabaseDataStore } from './supabaseDataStore';
import { createSupabasePlatformAudit } from './supabasePlatformAudit';
import { createSupabasePlatformGifting } from './supabasePlatformGifting';
import { createSupabasePlatformMembershipAdministration } from './supabasePlatformMembershipAdministration';
import { createSupabasePlatformMetrics } from './supabasePlatformMetrics';
import {
	createPlatformOrganizationDetail,
	type PlatformOrganizationDetail,
	type PlatformOrganizationDetailOrganizationRow,
	type PlatformOrganizationDetailStore
} from '$lib/server/core/useCases/platformOrganizationDetail';
import { buildPlanAdminDiagnostics } from '$lib/server/core/useCases/planAdminDiagnostics';
import { readOrganizationPlanUsage } from '$lib/server/core/useCases/organizationPlanUsage';
import { readEffectivePlanPolicy } from '$lib/server/core/useCases/planPolicy';
import type { BillingSnapshot } from '$lib/types/subscription';

const ORGANIZATION_SELECT = 'id, name, tier, gift_tier, gift_expires_at, suspended_at, created_at';
const BILLING_SNAPSHOT_SELECT =
	'organization_id, source, commercial_plan, stripe_customer_id, stripe_subscription_id, stripe_product_id, stripe_price_id, subscription_status, collection_status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, cancellation_reason, cancellation_feedback, trial_end, sync_status, last_stripe_event_id, last_stripe_event_type, last_stripe_event_created_at, last_processed_at, last_reconciled_at, reconciliation_result, drift_detected';

type SupabaseMaybeSingleResponse<T> = {
	data: T | null;
	error: unknown;
};

export type AdminOrganizationBillingSnapshotRow = {
	organization_id: string;
	source: BillingSnapshot['source'];
	commercial_plan: BillingSnapshot['commercialPlan'];
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

export function mapAdminOrganizationBillingSnapshot(row: AdminOrganizationBillingSnapshotRow): BillingSnapshot {
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

export function createSupabasePlatformOrganizationDetailStore(
	supabase: SupabaseClient
): PlatformOrganizationDetailStore {
	return {
		async getOrganizationById(orgId) {
			const response = (await supabase
				.from('organizations')
				.select(ORGANIZATION_SELECT)
				.eq('id', orgId)
				.maybeSingle<PlatformOrganizationDetailOrganizationRow>()) as SupabaseMaybeSingleResponse<PlatformOrganizationDetailOrganizationRow>;
			throwIfSupabaseError(response.error);
			return response.data;
		},

		async getBillingSnapshotByOrganization(orgId) {
			const response = (await supabase
				.from('organization_billing_snapshots')
				.select(BILLING_SNAPSHOT_SELECT)
				.eq('organization_id', orgId)
				.maybeSingle<AdminOrganizationBillingSnapshotRow>()) as SupabaseMaybeSingleResponse<AdminOrganizationBillingSnapshotRow>;
			throwIfSupabaseError(response.error);
			return response.data ? mapAdminOrganizationBillingSnapshot(response.data) : null;
		}
	};
}

export function createSupabasePlatformOrganizationDetail(ctx: AdminContext): PlatformOrganizationDetail {
	const dataStore = createSupabaseDataStore(ctx.adminClient);

	return createPlatformOrganizationDetail({
		store: createSupabasePlatformOrganizationDetailStore(ctx.adminClient),
		adminRole: ctx.adminUser.role,
		gifting: createSupabasePlatformGifting(ctx),
		membershipAdministration: createSupabasePlatformMembershipAdministration(ctx),
		metrics: createSupabasePlatformMetrics(ctx),
		audit: createSupabasePlatformAudit(ctx),
		async readPlanContext(orgId) {
			const [planPolicy, planUsage] = await Promise.all([
				readEffectivePlanPolicy({
					store: dataStore,
					auth: { orgId }
				}),
				readOrganizationPlanUsage({
					store: dataStore,
					auth: { orgId }
				})
			]);
			return {
				planPolicy,
				planDiagnostics: buildPlanAdminDiagnostics(planPolicy, planUsage)
			};
		}
	});
}
