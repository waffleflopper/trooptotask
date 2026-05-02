import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { isBillingEnabled } from '$lib/config/billing';
import { buildRouteContext, handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { cancelBillingSubscriptionForOrganization } from '$lib/server/core/useCases/billingOrganization';
import { requireGovernancePolicy } from '$lib/server/core/useCases/governancePolicy';

export const POST: RequestHandler = async (event) => {
	if (!isBillingEnabled) {
		return json({ error: 'Billing is not enabled' }, { status: 400 });
	}

	try {
		const ctx = await buildRouteContext(event);
		await requireGovernancePolicy(
			{ auth: ctx.auth, audit: ctx.audit },
			POLICY_ACTION_CATALOG.organization.accessBilling
		);

		await handleUseCaseRequest(
			{
				permission: 'owner',
				mutation: true,
				fn: cancelBillingSubscriptionForOrganization,
				audit: { action: 'billing.cancel', resourceType: 'organization' }
			},
			ctx,
			undefined
		);

		return json({ success: true });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		return json({ error: 'Failed to cancel subscription. Please try again.' }, { status: 500 });
	}
};
