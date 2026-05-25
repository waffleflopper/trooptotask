import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { isBillingEnabled } from '$lib/config/billing';
import { buildRouteContext, handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { cancelPendingCheckout } from '$lib/server/core/useCases/billing';
import { requireGovernancePolicy } from '$lib/server/core/useCases/governancePolicy';
import { billingApiErrorResponse } from '../../billingApiErrors';

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

		const result = await handleUseCaseRequest(
			{
				permission: 'owner',
				mutation: true,
				allowReadOnlyMutation: true,
				fn: cancelPendingCheckout,
				audit: { action: 'billing.checkout.cancel', resourceType: 'organization' }
			},
			ctx,
			undefined
		);

		return json(result);
	} catch (err) {
		return billingApiErrorResponse(err, 'Failed to cancel pending checkout. Please try again.');
	}
};
