import type { BillingCancellationFeedback } from '$lib/types/subscription';
import type { BillingReconciliationBatchStore } from '$lib/server/core/useCases/billingReconciliationBatch';

export async function recordImmediateBillingCancellationSnapshot(
	store: Pick<BillingReconciliationBatchStore, 'upsertSnapshot'>,
	input: {
		orgId: string;
		stripeCustomerId: string | null;
		cancellationFeedback: BillingCancellationFeedback | null;
		now?: Date;
	}
): Promise<void> {
	const nowIso = (input.now ?? new Date()).toISOString();

	await store.upsertSnapshot({
		organization_id: input.orgId,
		source: 'stripe',
		commercial_plan: 'free',
		stripe_customer_id: input.stripeCustomerId,
		stripe_subscription_id: null,
		stripe_product_id: null,
		stripe_price_id: null,
		subscription_status: 'canceled',
		collection_status: 'canceled',
		current_period_start: null,
		current_period_end: null,
		cancel_at_period_end: false,
		canceled_at: nowIso,
		cancellation_reason: 'cancellation_requested',
		cancellation_feedback: input.cancellationFeedback,
		trial_end: null,
		sync_status: 'pending',
		last_stripe_event_id: null,
		last_stripe_event_type: null,
		last_stripe_event_created_at: null,
		last_processed_at: nowIso,
		last_reconciled_at: null,
		reconciliation_result: 'local_immediate_cancellation_pending_webhook',
		drift_detected: false
	});
}
