import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	BillingReconciliationOrganizationRow,
	BillingReconciliationSnapshotRow,
	BillingReconciliationStore
} from '$lib/server/core/useCases/billingReconciliation';

export function createSupabaseBillingReconciliationStore(supabase: SupabaseClient): BillingReconciliationStore {
	return {
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
