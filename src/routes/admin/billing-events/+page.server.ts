import { fail } from '@sveltejs/kit';
import type Stripe from 'stripe';
import type { Actions, PageServerLoad } from './$types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminAction, loadWithAdminContext, type AdminContext } from '$lib/server/adapters/adminAdapter';
import { createSupabasePlatformBillingEvents } from '$lib/server/adapters/supabasePlatformBillingEvents';
import type { PlatformBillingEventRecord } from '$lib/server/core/useCases/platformBillingEvents';
import {
	_recordRetryableStripeWebhookEventAttempt,
	_processRecordedStripeWebhookEvent,
	type WebhookProcessingState
} from '$lib/server/billing/stripeWebhookProcessing';

const RECENT_EVENT_LIMIT = 50;
const RETRYABLE_STATE: WebhookProcessingState = 'retryable_failed';

function normalizeAttemptCount(value: number | null): number {
	return typeof value === 'number' ? value : 0;
}

function stripeEventFromLedgerRow(row: PlatformBillingEventRecord): Stripe.Event {
	const eventCreatedAt = row.eventCreatedAt ?? row.createdAt ?? new Date(0).toISOString();
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

	let eventRow: PlatformBillingEventRecord | null;
	try {
		eventRow = await createSupabasePlatformBillingEvents(ctx).getEventById(trimmedEventId);
	} catch (err) {
		console.error('Admin billing event lookup failed:', { eventId: trimmedEventId, err });
		return { ok: false, status: 500, error: 'Failed to fetch billing event.' };
	}

	if (!eventRow) return { ok: false, status: 404, error: 'Billing event was not found.' };
	if (eventRow.processingState !== RETRYABLE_STATE || eventRow.processed === true) {
		return {
			ok: false,
			status: 400,
			error: `${eventRow.processingState ?? 'unknown'} billing events cannot be retried.`
		};
	}

	const event = stripeEventFromLedgerRow(eventRow);
	const eventCreatedAt = eventRow.eventCreatedAt ?? new Date(event.created * 1000).toISOString();
	const attemptCountBefore = normalizeAttemptCount(eventRow.attemptCount);

	try {
		await _recordRetryableStripeWebhookEventAttempt(ctx.adminClient as SupabaseClient, event, {
			objectId: eventRow.objectId,
			secondaryDedupeKey: eventRow.secondaryDedupeKey ?? undefined,
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
				objectId: eventRow.objectId,
				processingStateBefore: eventRow.processingState,
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
		secondaryDedupeKey: eventRow.secondaryDedupeKey ?? undefined,
		eventCreatedAt
	});

	ctx.audit({
		action: 'admin.billing_event.retry',
		resourceType: 'stripe_webhook_event',
		resourceId: eventRow.id,
		severity: result.ok ? 'info' : 'warning',
		details: {
			eventType: eventRow.type,
			objectId: eventRow.objectId,
			processingStateBefore: eventRow.processingState,
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
	fn: async (ctx) => createSupabasePlatformBillingEvents(ctx).listDiagnostics({ limit: RECENT_EVENT_LIMIT })
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
