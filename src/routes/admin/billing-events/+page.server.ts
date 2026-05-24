import { fail } from '@sveltejs/kit';
import type Stripe from 'stripe';
import type { Actions, PageServerLoad } from './$types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminAction, loadWithAdminContext, type AdminContext } from '$lib/server/adapters/adminAdapter';
import {
	_recordRetryableStripeWebhookEventAttempt,
	_processRecordedStripeWebhookEvent,
	type WebhookProcessingState
} from '../../api/webhooks/stripe/+server';

const RECENT_EVENT_LIMIT = 50;
const RETRYABLE_STATE: WebhookProcessingState = 'retryable_failed';

type BillingEventRow = {
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
};

type BillingSnapshotLinkRow = {
	organization_id: string;
	stripe_customer_id: string | null;
	stripe_subscription_id: string | null;
	last_stripe_event_id: string | null;
};

type OrganizationLinkRow = {
	id: string;
	name: string;
};

export type BillingEventDiagnostic = {
	id: string;
	type: string;
	objectId: string | null;
	secondaryDedupeKey: string | null;
	eventCreatedAt: string | null;
	processed: boolean;
	processedAt: string | null;
	processingState: WebhookProcessingState | null;
	attemptCount: number;
	lastError: string | null;
	processingResult: string | null;
	createdAt: string | null;
	updatedAt: string | null;
	canRetry: boolean;
	organization: { id: string; name: string | null } | null;
};

function normalizeAttemptCount(value: number | null): number {
	return typeof value === 'number' ? value : 0;
}

export function _mapBillingEventDiagnostics(
	events: BillingEventRow[],
	snapshots: BillingSnapshotLinkRow[],
	organizations: OrganizationLinkRow[]
): BillingEventDiagnostic[] {
	const organizationNameById = new Map(organizations.map((org) => [org.id, org.name]));
	const snapshotByEventId = new Map<string, BillingSnapshotLinkRow>();
	const snapshotByStripeObjectId = new Map<string, BillingSnapshotLinkRow>();

	for (const snapshot of snapshots) {
		if (snapshot.last_stripe_event_id) snapshotByEventId.set(snapshot.last_stripe_event_id, snapshot);
		if (snapshot.stripe_subscription_id) snapshotByStripeObjectId.set(snapshot.stripe_subscription_id, snapshot);
		if (snapshot.stripe_customer_id) snapshotByStripeObjectId.set(snapshot.stripe_customer_id, snapshot);
	}

	return events.map((event) => {
		const snapshot =
			snapshotByEventId.get(event.id) ?? (event.object_id ? snapshotByStripeObjectId.get(event.object_id) : undefined);
		const organization = snapshot
			? {
					id: snapshot.organization_id,
					name: organizationNameById.get(snapshot.organization_id) ?? null
				}
			: null;

		return {
			id: event.id,
			type: event.type,
			objectId: event.object_id,
			secondaryDedupeKey: event.secondary_dedupe_key,
			eventCreatedAt: event.event_created_at,
			processed: event.processed === true,
			processedAt: event.processed_at,
			processingState: event.processing_state,
			attemptCount: normalizeAttemptCount(event.attempt_count),
			lastError: event.last_error,
			processingResult: event.processing_result,
			createdAt: event.created_at,
			updatedAt: event.updated_at,
			canRetry: event.processing_state === RETRYABLE_STATE,
			organization
		};
	});
}

async function loadBillingEventDiagnostics(ctx: AdminContext): Promise<{
	events: BillingEventDiagnostic[];
	diagnosticsError: boolean;
}> {
	const { adminClient } = ctx;
	const { data: eventRows, error: eventsError } = await adminClient
		.from('stripe_webhook_events')
		.select(
			'id, type, object_id, secondary_dedupe_key, event_created_at, processed, processed_at, processing_state, attempt_count, last_error, processing_result, created_at, updated_at'
		)
		.order('event_created_at', { ascending: false, nullsFirst: false })
		.order('created_at', { ascending: false })
		.limit(RECENT_EVENT_LIMIT);

	if (eventsError) {
		console.error('Admin billing events query failed:', eventsError);
		return { events: [], diagnosticsError: true };
	}

	const events = (eventRows ?? []) as BillingEventRow[];
	if (events.length === 0) return { events: [], diagnosticsError: false };

	const eventIds = events.map((event) => event.id);
	const objectIds = [...new Set(events.map((event) => event.object_id).filter((id): id is string => !!id))];
	const snapshotFilters = [
		`last_stripe_event_id.in.(${eventIds.join(',')})`,
		objectIds.length ? `stripe_subscription_id.in.(${objectIds.join(',')})` : null,
		objectIds.length ? `stripe_customer_id.in.(${objectIds.join(',')})` : null
	].filter((filter): filter is string => !!filter);
	const snapshotQuery = adminClient
		.from('organization_billing_snapshots')
		.select('organization_id, stripe_customer_id, stripe_subscription_id, last_stripe_event_id');
	const { data: snapshotRows, error: snapshotsError } = snapshotFilters.length
		? await snapshotQuery.or(snapshotFilters.join(','))
		: { data: [], error: null };

	if (snapshotsError) {
		console.error('Admin billing event snapshot-link query failed:', snapshotsError);
		return { events: _mapBillingEventDiagnostics(events, [], []), diagnosticsError: true };
	}

	const snapshots = (snapshotRows ?? []) as BillingSnapshotLinkRow[];
	const organizationIds = [...new Set(snapshots.map((snapshot) => snapshot.organization_id))];
	const { data: organizationRows, error: organizationsError } = organizationIds.length
		? await adminClient.from('organizations').select('id, name').in('id', organizationIds)
		: { data: [], error: null };

	if (organizationsError) {
		console.error('Admin billing event organization-link query failed:', organizationsError);
		return { events: _mapBillingEventDiagnostics(events, snapshots, []), diagnosticsError: true };
	}

	return {
		events: _mapBillingEventDiagnostics(events, snapshots, (organizationRows ?? []) as OrganizationLinkRow[]),
		diagnosticsError: false
	};
}

function stripeEventFromLedgerRow(row: BillingEventRow): Stripe.Event {
	const eventCreatedAt = row.event_created_at ?? row.created_at ?? new Date(0).toISOString();
	const createdSeconds = Math.floor(new Date(eventCreatedAt).getTime() / 1000);
	return {
		id: row.id,
		type: row.type,
		created: Number.isFinite(createdSeconds) ? createdSeconds : 0,
		data: row.data ?? { object: {} }
	} as Stripe.Event;
}

export async function _retryBillingEventCore(
	ctx: AdminContext,
	eventId: string
): Promise<{ ok: true; state: WebhookProcessingState; result: string } | { ok: false; status: number; error: string }> {
	const trimmedEventId = eventId.trim();
	if (!trimmedEventId) return { ok: false, status: 400, error: 'Missing billing event ID.' };

	const { data: eventRow, error: eventError } = await ctx.adminClient
		.from('stripe_webhook_events')
		.select(
			'id, type, data, object_id, secondary_dedupe_key, event_created_at, processed, processed_at, processing_state, attempt_count, last_error, processing_result, created_at, updated_at'
		)
		.eq('id', trimmedEventId)
		.single<BillingEventRow>();

	if (eventError || !eventRow) return { ok: false, status: 404, error: 'Billing event was not found.' };
	if (eventRow.processing_state !== RETRYABLE_STATE || eventRow.processed === true) {
		return {
			ok: false,
			status: 400,
			error: `${eventRow.processing_state ?? 'unknown'} billing events cannot be retried.`
		};
	}

	const event = stripeEventFromLedgerRow(eventRow);
	const eventCreatedAt = eventRow.event_created_at ?? new Date(event.created * 1000).toISOString();
	const attemptCountBefore = normalizeAttemptCount(eventRow.attempt_count);

	try {
		await _recordRetryableStripeWebhookEventAttempt(ctx.adminClient as SupabaseClient, event, {
			objectId: eventRow.object_id,
			secondaryDedupeKey: eventRow.secondary_dedupe_key ?? undefined,
			eventCreatedAt
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to record billing event retry.';
		ctx.audit({
			action: 'admin.billing_event.retry',
			resourceType: 'stripe_webhook_event',
			resourceId: eventRow.id,
			severity: 'warning',
			details: {
				eventType: eventRow.type,
				objectId: eventRow.object_id,
				processingStateBefore: eventRow.processing_state,
				attemptCountBefore,
				resultState: 'ledger_error',
				result: message
			}
		});
		return {
			ok: false,
			status: message.includes('no longer retryable') ? 409 : 500,
			error: message
		};
	}

	const result = await _processRecordedStripeWebhookEvent(ctx.adminClient as SupabaseClient, event, {
		secondaryDedupeKey: eventRow.secondary_dedupe_key ?? undefined,
		eventCreatedAt
	});

	ctx.audit({
		action: 'admin.billing_event.retry',
		resourceType: 'stripe_webhook_event',
		resourceId: eventRow.id,
		severity: result.ok ? 'info' : 'warning',
		details: {
			eventType: eventRow.type,
			objectId: eventRow.object_id,
			processingStateBefore: eventRow.processing_state,
			attemptCountBefore,
			resultState: result.state,
			result: result.result
		}
	});

	if (!result.ok) {
		return { ok: false, status: result.status >= 400 ? result.status : 400, error: result.error ?? result.result };
	}

	return { ok: true, state: result.state, result: result.result };
}

export const load: PageServerLoad = loadWithAdminContext({
	page: 'billing-events',
	fn: async (ctx) => loadBillingEventDiagnostics(ctx)
});

export const actions: Actions = {
	retry: adminAction({
		page: 'billing-events',
		fn: async (ctx, event) => {
			const formData = await event.request.formData();
			const eventId = String(formData.get('eventId') ?? '');
			const result = await _retryBillingEventCore(ctx, eventId);
			if (!result.ok) return fail(result.status, { error: result.error, eventId });
			return { success: true, eventId, result: result.result, state: result.state };
		}
	})
};
