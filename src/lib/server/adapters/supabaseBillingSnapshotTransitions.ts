import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	BillingSnapshotTransitionStore,
	BillingSnapshotUpsert,
	ExistingBillingSnapshot
} from '$lib/server/core/useCases/billingSnapshotTransitions';

const BILLING_SNAPSHOT_TRANSITION_SELECT =
	'organization_id, commercial_plan, stripe_customer_id, stripe_subscription_id, stripe_product_id, stripe_price_id, subscription_status, collection_status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, cancellation_reason, cancellation_feedback, trial_end, last_stripe_event_id, last_stripe_event_created_at';

export function createSupabaseBillingSnapshotTransitionStore(supabase: SupabaseClient): BillingSnapshotTransitionStore {
	return {
		async readSnapshot(orgId) {
			const { data, error } = await supabase
				.from('organization_billing_snapshots')
				.select(BILLING_SNAPSHOT_TRANSITION_SELECT)
				.eq('organization_id', orgId)
				.single<ExistingBillingSnapshot>();

			if (error && 'code' in error && error.code === 'PGRST116') return null;
			if (error) throw new Error(`Failed to read billing snapshot for org ${orgId}: ${error.message}`);
			return data ?? null;
		},

		async upsertSnapshotIfCurrent(values, eventPosition) {
			if (eventPosition) {
				return upsertSnapshotThroughCurrentEventRpc(supabase, values);
			}

			const { error } = await supabase
				.from('organization_billing_snapshots')
				.upsert(values, { onConflict: 'organization_id' });
			if (error) throw new Error(`Failed to update billing snapshot: ${error.message}`);
			return true;
		},

		async updateOrganizationBillingMirror(orgId, values) {
			const { error } = await supabase.from('organizations').update(values).eq('id', orgId);
			if (error) throw new Error(`Failed to update org ${orgId}: ${error.message}`);
		}
	};
}

async function upsertSnapshotThroughCurrentEventRpc(
	supabase: SupabaseClient,
	values: BillingSnapshotUpsert
): Promise<boolean> {
	const { data, error } = await supabase.rpc('upsert_organization_billing_snapshot_if_current', {
		p_snapshot: values
	});
	if (error) throw new Error(`Failed to update billing snapshot: ${error.message}`);
	return data === true;
}
