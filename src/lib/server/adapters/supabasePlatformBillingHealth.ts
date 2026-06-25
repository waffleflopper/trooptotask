import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminContext } from './adminAdapter';
import {
	createPlatformBillingHealth,
	type PlatformBillingHealth,
	type PlatformBillingHealthEventRecord,
	type PlatformBillingHealthLinkedBillingContext,
	type PlatformBillingHealthSnapshotRecord,
	type PlatformBillingHealthStore
} from '$lib/server/core/useCases/platformBillingHealth';
import type { WebhookProcessingState } from '$lib/server/billing/stripeWebhookProcessing';
import type { BillingSnapshot } from '$lib/types/subscription';
import type { Tier } from '$lib/types/subscription';

type SupabaseResponse<T> = {
	data: T | null;
	error: unknown;
};

interface BillingHealthEventRow {
	id: string;
	type: string;
	object_id: string | null;
	event_created_at: string | null;
	processing_state: WebhookProcessingState | null;
	attempt_count: number | null;
	processing_result: string | null;
	created_at: string | null;
	updated_at: string | null;
}

interface BillingHealthSnapshotRow {
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
	organizations: { id: string; name: string } | { id: string; name: string }[] | null;
}

const SAFE_HEALTH_EVENT_COLUMNS =
	'id, type, object_id, event_created_at, processing_state, attempt_count, processing_result, created_at, updated_at';

const BILLING_HEALTH_SNAPSHOT_COLUMNS =
	'organization_id, source, commercial_plan, stripe_customer_id, stripe_subscription_id, stripe_product_id, stripe_price_id, subscription_status, collection_status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, cancellation_reason, cancellation_feedback, trial_end, sync_status, last_stripe_event_id, last_stripe_event_type, last_stripe_event_created_at, last_processed_at, last_reconciled_at, reconciliation_result, drift_detected, organizations!inner(id, name)';

const FAILED_WEBHOOK_PROCESSING_STATES: WebhookProcessingState[] = ['retryable_failed', 'permanently_failed'];
const PAID_COMMERCIAL_PLANS: Exclude<Tier, 'free'>[] = ['team', 'unit'];
const PAYMENT_RECOVERY_SUBSCRIPTION_STATUSES: Array<NonNullable<BillingSnapshot['subscriptionStatus']>> = [
	'past_due',
	'unpaid'
];
const PAYMENT_RECOVERY_COLLECTION_STATUSES = ['payment_failed_grace', 'payment_failed_terminal'];

function throwIfSupabaseError(error: unknown): void {
	if (error) throw error;
}

function organizationName(row: BillingHealthSnapshotRow): string | null {
	const organization = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
	return organization?.name ?? null;
}

function mapHealthEvent(row: BillingHealthEventRow): PlatformBillingHealthEventRecord {
	return {
		id: row.id,
		type: row.type,
		objectId: row.object_id,
		eventCreatedAt: row.event_created_at,
		processingState: row.processing_state,
		attemptCount: row.attempt_count,
		processingResult: row.processing_result,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

function partitionStripeObjectIds(objectIds: string[]): { customerIds: string[]; subscriptionIds: string[] } {
	const customerIds: string[] = [];
	const subscriptionIds: string[] = [];
	for (const objectId of objectIds) {
		if (objectId.startsWith('cus_')) {
			customerIds.push(objectId);
		} else if (objectId.startsWith('sub_')) {
			subscriptionIds.push(objectId);
		} else {
			customerIds.push(objectId);
			subscriptionIds.push(objectId);
		}
	}
	return { customerIds, subscriptionIds };
}

function billingSnapshotLinkFilters(events: PlatformBillingHealthEventRecord[]): string[] {
	const eventIds = events.map((event) => event.id).filter(Boolean);
	const objectIds = events.map((event) => event.objectId).filter((objectId): objectId is string => !!objectId);
	const { customerIds, subscriptionIds } = partitionStripeObjectIds(objectIds);
	return [
		eventIds.length ? `last_stripe_event_id.in.(${eventIds.join(',')})` : null,
		subscriptionIds.length ? `stripe_subscription_id.in.(${subscriptionIds.join(',')})` : null,
		customerIds.length ? `stripe_customer_id.in.(${customerIds.join(',')})` : null
	].filter((filter): filter is string => !!filter);
}

function linkedBillingContext(row: BillingHealthSnapshotRow): PlatformBillingHealthLinkedBillingContext {
	return {
		organizationId: row.organization_id,
		organizationName: organizationName(row),
		stripeCustomerId: row.stripe_customer_id,
		stripeSubscriptionId: row.stripe_subscription_id,
		billingState: {
			source: row.source,
			commercialPlan: row.commercial_plan,
			subscriptionStatus: row.subscription_status,
			collectionStatus: row.collection_status,
			syncStatus: row.sync_status,
			driftDetected: row.drift_detected ?? false
		}
	};
}

function snapshotMatchesEvent(snapshot: BillingHealthSnapshotRow, event: PlatformBillingHealthEventRecord): boolean {
	return (
		snapshot.last_stripe_event_id === event.id ||
		(!!event.objectId &&
			(snapshot.stripe_customer_id === event.objectId || snapshot.stripe_subscription_id === event.objectId))
	);
}

function attachLinkedBillingContexts(
	events: PlatformBillingHealthEventRecord[],
	snapshots: BillingHealthSnapshotRow[]
): PlatformBillingHealthEventRecord[] {
	return events.map((event) => {
		const snapshot = snapshots.find((candidate) => snapshotMatchesEvent(candidate, event));
		if (!snapshot) return event;
		return {
			...event,
			linkedBillingContext: linkedBillingContext(snapshot)
		};
	});
}

function mapHealthSnapshot(row: BillingHealthSnapshotRow): PlatformBillingHealthSnapshotRecord {
	return {
		organizationId: row.organization_id,
		organizationName: organizationName(row),
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

function dedupeSnapshotsByOrganization(rows: BillingHealthSnapshotRow[]): BillingHealthSnapshotRow[] {
	const seen = new Set<string>();
	const snapshots: BillingHealthSnapshotRow[] = [];
	for (const row of rows) {
		if (seen.has(row.organization_id)) continue;
		seen.add(row.organization_id);
		snapshots.push(row);
	}
	return snapshots;
}

export function createSupabasePlatformBillingHealthStore(supabase: SupabaseClient): PlatformBillingHealthStore {
	return {
		async listRecentHealthEvents(limit) {
			const response = (await supabase
				.from('stripe_webhook_events')
				.select(SAFE_HEALTH_EVENT_COLUMNS)
				.in('processing_state', FAILED_WEBHOOK_PROCESSING_STATES)
				.order('event_created_at', { ascending: false, nullsFirst: false })
				.order('created_at', { ascending: false })
				.limit(limit)) as SupabaseResponse<BillingHealthEventRow[]>;
			throwIfSupabaseError(response.error);
			const events = (response.data ?? []).map(mapHealthEvent);
			const filters = billingSnapshotLinkFilters(events);
			if (filters.length === 0) return events;

			const snapshotResponse = (await supabase
				.from('organization_billing_snapshots')
				.select(BILLING_HEALTH_SNAPSHOT_COLUMNS)
				.or(filters.join(','))
				.order('last_processed_at', { ascending: false, nullsFirst: false })
				.limit(limit)) as SupabaseResponse<BillingHealthSnapshotRow[]>;
			throwIfSupabaseError(snapshotResponse.error);
			return attachLinkedBillingContexts(events, snapshotResponse.data ?? []);
		},

		async listBillingSnapshotsForHealth(input) {
			const [driftResponse, paymentResponse, staleResponse] = (await Promise.all([
				supabase
					.from('organization_billing_snapshots')
					.select(BILLING_HEALTH_SNAPSHOT_COLUMNS)
					.or('drift_detected.eq.true,sync_status.eq.needs_reconciliation')
					.order('last_processed_at', { ascending: false, nullsFirst: false })
					.order('last_reconciled_at', { ascending: true, nullsFirst: true })
					.limit(input.limit),
				supabase
					.from('organization_billing_snapshots')
					.select(BILLING_HEALTH_SNAPSHOT_COLUMNS)
					.or(
						[
							`subscription_status.in.(${PAYMENT_RECOVERY_SUBSCRIPTION_STATUSES.join(',')})`,
							`collection_status.in.(${PAYMENT_RECOVERY_COLLECTION_STATUSES.join(',')})`
						].join(',')
					)
					.order('last_processed_at', { ascending: false, nullsFirst: false })
					.order('last_reconciled_at', { ascending: true, nullsFirst: true })
					.limit(input.limit),
				supabase
					.from('organization_billing_snapshots')
					.select(BILLING_HEALTH_SNAPSHOT_COLUMNS)
					.eq('source', 'stripe')
					.in('commercial_plan', PAID_COMMERCIAL_PLANS)
					.or(`last_reconciled_at.is.null,last_reconciled_at.lt.${input.staleReconciledBefore}`)
					.order('last_reconciled_at', { ascending: true, nullsFirst: true })
					.limit(input.limit)
			])) as [
				SupabaseResponse<BillingHealthSnapshotRow[]>,
				SupabaseResponse<BillingHealthSnapshotRow[]>,
				SupabaseResponse<BillingHealthSnapshotRow[]>
			];
			throwIfSupabaseError(driftResponse.error);
			throwIfSupabaseError(paymentResponse.error);
			throwIfSupabaseError(staleResponse.error);
			return dedupeSnapshotsByOrganization([
				...(driftResponse.data ?? []),
				...(paymentResponse.data ?? []),
				...(staleResponse.data ?? [])
			])
				.slice(0, input.limit)
				.map(mapHealthSnapshot);
		}
	};
}

export function createSupabasePlatformBillingHealth(ctx: AdminContext): PlatformBillingHealth {
	return createPlatformBillingHealth({
		store: createSupabasePlatformBillingHealthStore(ctx.adminClient),
		adminRole: ctx.adminUser.role
	});
}
