import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import type { AdminContext } from './adminAdapter';
import {
	createPlatformBillingEvents,
	type PlatformBillingEventRecord,
	type PlatformBillingEventRetryProcessor,
	type PlatformBillingEvents,
	type PlatformBillingEventsStore,
	type PlatformBillingOrganizationLink,
	type PlatformBillingSnapshotLink
} from '$lib/server/core/useCases/platformBillingEvents';
import {
	_processRecordedStripeWebhookEvent,
	_recordRetryableStripeWebhookEventAttempt,
	type WebhookProcessingState
} from '$lib/server/billing/stripeWebhookProcessing';

type SupabaseResponse<T> = {
	data: T | null;
	error: unknown;
};

interface BillingEventRow {
	id: string;
	type: string;
	object_id: string | null;
	secondary_dedupe_key: string | null;
	event_created_at: string | null;
	processed: boolean | null;
	processed_at: string | null;
	processing_state: WebhookProcessingState | null;
	attempt_count: number | null;
	last_error: string | null;
	processing_result: string | null;
	created_at: string | null;
	updated_at: string | null;
	data?: Stripe.Event.Data | null;
}

interface BillingSnapshotLinkRow {
	organization_id: string;
	stripe_customer_id: string | null;
	stripe_subscription_id: string | null;
	last_stripe_event_id: string | null;
}

interface OrganizationLinkRow {
	id: string;
	name: string;
}

function formatSupabaseError(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	if (error && typeof error === 'object') {
		const candidate = error as { message?: unknown; code?: unknown };
		const message = typeof candidate.message === 'string' ? candidate.message : JSON.stringify(error);
		return typeof candidate.code === 'string' ? `${message} (${candidate.code})` : message;
	}
	return String(error);
}

function assertSupabaseSuccess<T>(operation: string, response: SupabaseResponse<T>): void {
	if (response.error) {
		throw new Error(`${operation} failed: ${formatSupabaseError(response.error)}`);
	}
}

function mapBillingEvent(row: BillingEventRow): PlatformBillingEventRecord {
	return {
		id: row.id,
		type: row.type,
		objectId: row.object_id,
		secondaryDedupeKey: row.secondary_dedupe_key,
		eventCreatedAt: row.event_created_at,
		processed: row.processed,
		processedAt: row.processed_at,
		processingState: row.processing_state,
		attemptCount: row.attempt_count,
		lastError: row.last_error,
		processingResult: row.processing_result,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		data: row.data
	};
}

function mapSnapshot(row: BillingSnapshotLinkRow): PlatformBillingSnapshotLink {
	return {
		organizationId: row.organization_id,
		stripeCustomerId: row.stripe_customer_id,
		stripeSubscriptionId: row.stripe_subscription_id,
		lastStripeEventId: row.last_stripe_event_id
	};
}

function mapOrganization(row: OrganizationLinkRow): PlatformBillingOrganizationLink {
	return {
		id: row.id,
		name: row.name
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

function buildSnapshotFilters(input: { eventIds: string[]; objectIds: string[] }): string[] {
	const { customerIds, subscriptionIds } = partitionStripeObjectIds(input.objectIds);
	return [
		input.eventIds.length ? `last_stripe_event_id.in.(${input.eventIds.join(',')})` : null,
		subscriptionIds.length ? `stripe_subscription_id.in.(${subscriptionIds.join(',')})` : null,
		customerIds.length ? `stripe_customer_id.in.(${customerIds.join(',')})` : null
	].filter((filter): filter is string => !!filter);
}

const SAFE_EVENT_COLUMNS =
	'id, type, object_id, secondary_dedupe_key, event_created_at, processed, processed_at, processing_state, attempt_count, last_error, processing_result, created_at, updated_at';

export function createSupabasePlatformBillingEventsStore(supabase: SupabaseClient): PlatformBillingEventsStore {
	return {
		async listRecentEvents(limit) {
			const response = (await supabase
				.from('stripe_webhook_events')
				.select(SAFE_EVENT_COLUMNS)
				.order('event_created_at', { ascending: false, nullsFirst: false })
				.order('created_at', { ascending: false })
				.limit(limit)) as SupabaseResponse<BillingEventRow[]>;
			assertSupabaseSuccess('table stripe_webhook_events recent events', response);
			return (response.data ?? []).map(mapBillingEvent);
		},

		async getEventById(id) {
			const response = (await supabase
				.from('stripe_webhook_events')
				.select(`${SAFE_EVENT_COLUMNS}, data`)
				.eq('id', id)
				.maybeSingle()) as SupabaseResponse<BillingEventRow>;
			assertSupabaseSuccess('table stripe_webhook_events event fetch', response);
			return response.data ? mapBillingEvent(response.data) : null;
		},

		async listSnapshotsForEvents(input) {
			const filters = buildSnapshotFilters(input);
			if (filters.length === 0) return [];

			const response = (await supabase
				.from('organization_billing_snapshots')
				.select('organization_id, stripe_customer_id, stripe_subscription_id, last_stripe_event_id')
				.or(filters.join(','))) as SupabaseResponse<BillingSnapshotLinkRow[]>;
			assertSupabaseSuccess('table organization_billing_snapshots billing event links', response);
			return (response.data ?? []).map(mapSnapshot);
		},

		async listOrganizationsById(ids) {
			if (ids.length === 0) return [];

			const response = (await supabase.from('organizations').select('id, name').in('id', ids)) as SupabaseResponse<
				OrganizationLinkRow[]
			>;
			assertSupabaseSuccess('table organizations billing event links', response);
			return (response.data ?? []).map(mapOrganization);
		}
	};
}

function createSupabaseBillingEventRetryProcessor(supabase: SupabaseClient): PlatformBillingEventRetryProcessor {
	return {
		recordRetryAttempt(event, metadata) {
			return _recordRetryableStripeWebhookEventAttempt(supabase, event, metadata);
		},
		processRecordedEvent(event, metadata) {
			return _processRecordedStripeWebhookEvent(supabase, event, metadata);
		}
	};
}

export function createSupabasePlatformBillingEvents(ctx: AdminContext): PlatformBillingEvents {
	return createPlatformBillingEvents({
		store: createSupabasePlatformBillingEventsStore(ctx.adminClient),
		retryProcessor: createSupabaseBillingEventRetryProcessor(ctx.adminClient),
		audit: (event) => ctx.audit(event)
	});
}
