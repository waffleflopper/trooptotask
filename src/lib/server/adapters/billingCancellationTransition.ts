import type { BillingCancellationTransitionPort } from '$lib/server/core/useCases/billingOrganization';
import { applyBillingSnapshotTransition } from '$lib/server/core/useCases/billingSnapshotTransitions';
import { getAdminClient } from '$lib/server/supabase';
import { createSupabaseBillingSnapshotTransitionStore } from './supabaseBillingSnapshotTransitions';

export function createSupabaseBillingCancellationTransitionPort(): BillingCancellationTransitionPort {
	return {
		async applyImmediateCancellation(input) {
			await applyBillingSnapshotTransition(createSupabaseBillingSnapshotTransitionStore(getAdminClient()), {
				kind: 'immediate_cancellation_requested',
				orgId: input.orgId,
				stripeCustomerId: input.stripeCustomerId,
				cancellationFeedback: input.cancellationFeedback
			});
		}
	};
}
