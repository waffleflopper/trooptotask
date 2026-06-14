import { getConfiguredPriceCatalog } from '$lib/server/billing/priceCatalog';
import {
	createDefaultBillingCheckoutRecoveryPorts,
	type BillingCheckoutRecoveryPorts
} from '$lib/server/core/useCases/billingCheckoutRecovery';
import { reconcileOrganizationBilling } from '$lib/server/core/useCases/billingReconciliation';
import { getAdminClient } from '$lib/server/supabase';
import { createStripeBillingReconciliationProvider, retrieveCheckoutSessionForRecovery } from '$lib/server/stripe';
import { createSupabaseBillingReconciliationStore } from './supabaseBillingReconciliation';
import { createSupabaseSubscriptionAdapter } from './supabaseSubscription';

export function createSupabaseBillingCheckoutRecoveryPorts(orgId: string): BillingCheckoutRecoveryPorts {
	return createDefaultBillingCheckoutRecoveryPorts({
		retrieveCheckoutSession: retrieveCheckoutSessionForRecovery,
		async reconcileOrganizationBilling(targetOrgId) {
			if (targetOrgId !== orgId) {
				throw new Error(`Billing checkout recovery org mismatch: expected ${orgId}, received ${targetOrgId}`);
			}
			const adminClient = getAdminClient();
			await reconcileOrganizationBilling({
				orgId: targetOrgId,
				store: createSupabaseBillingReconciliationStore(adminClient),
				provider: createStripeBillingReconciliationProvider(),
				subscription: createSupabaseSubscriptionAdapter(adminClient, targetOrgId),
				priceCatalog: getConfiguredPriceCatalog(),
				dryRun: false
			});
		}
	});
}
