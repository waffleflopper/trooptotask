import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	BillingReconciliationOrganizationRow,
	BillingReconciliationSnapshotRow
} from '$lib/server/core/useCases/billingReconciliation';
import type { BillingReconciliationBatchStore } from '$lib/server/core/useCases/billingReconciliationBatch';

export function createSupabaseBillingReconciliationStore(supabase: SupabaseClient): BillingReconciliationBatchStore {
	return {
		async listCandidates(input) {
			let query = supabase
				.from('organizations')
				.select('id')
				.or(
					'tier.in.(team,unit),stripe_subscription_id.not.is.null,subscription_status.in.(active,past_due,canceled,unpaid,paused)'
				)
				.order('id', { ascending: true })
				.limit(input.limit);

			if (input.cursor) {
				query = query.gt('id', input.cursor);
			}

			const { data, error } = await query;
			if (error) throw new Error(`Failed to list billing reconciliation candidates: ${error.message}`);
			return (data ?? []).map((row) => ({ orgId: row.id as string }));
		},

		async readOrganization(orgId) {
			const { data, error } = await supabase
				.from('organizations')
				.select('id, tier, stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end')
				.eq('id', orgId)
				.maybeSingle<BillingReconciliationOrganizationRow>();
			if (error) throw new Error(`Failed to read organization billing fields: ${error.message}`);
			return data ?? null;
		},

		async readSnapshot(orgId) {
			const { data, error } = await supabase
				.from('organization_billing_snapshots')
				.select(
					'organization_id, source, commercial_plan, stripe_customer_id, stripe_subscription_id, stripe_product_id, stripe_price_id, subscription_status, collection_status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, trial_end, sync_status, last_stripe_event_id, last_stripe_event_type, last_stripe_event_created_at, last_processed_at, last_reconciled_at, reconciliation_result, drift_detected'
				)
				.eq('organization_id', orgId)
				.maybeSingle<BillingReconciliationSnapshotRow>();
			if (error) throw new Error(`Failed to read organization billing snapshot: ${error.message}`);
			return data ?? null;
		},

		async upsertSnapshot(values) {
			const { error } = await supabase
				.from('organization_billing_snapshots')
				.upsert(values, { onConflict: 'organization_id' });
			if (error) throw new Error(`Failed to upsert organization billing snapshot: ${error.message}`);
		},

		async updateSnapshotDiagnostics(orgId, values) {
			const { error } = await supabase.from('organization_billing_snapshots').upsert(
				{
					organization_id: orgId,
					...values
				},
				{ onConflict: 'organization_id' }
			);
			if (error) throw new Error(`Failed to update organization billing reconciliation diagnostics: ${error.message}`);
		},

		async updateOrganizationBillingMirror(orgId, values) {
			const { error } = await supabase.from('organizations').update(values).eq('id', orgId);
			if (error) throw new Error(`Failed to update organization billing mirror: ${error.message}`);
		}
	};
}
