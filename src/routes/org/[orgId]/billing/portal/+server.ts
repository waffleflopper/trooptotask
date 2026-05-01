import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { isBillingEnabled } from '$lib/config/billing';
import { buildRouteContext, handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { portal } from '$lib/server/core/useCases/billing';
import { readBillingOrganization } from '$lib/server/core/useCases/billingOrganization';
import { fail } from '$lib/server/core/errors';
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

		const { orgId } = event.params;
		const org = await readBillingOrganization({ auth: ctx.auth, store: ctx.rawStore });
		const customerId = org.stripeCustomerId;

		if (!customerId) {
			fail(400, 'No active subscription found for this organization');
		}

		const result = await handleUseCaseRequest(
			{
				permission: 'owner',
				mutation: true,
				fn: (c) =>
					portal(c, {
						customerId,
						returnUrl: `${event.url.origin}/org/${orgId}/billing`
					}),
				audit: { action: 'billing.portal', resourceType: 'organization' }
			},
			ctx,
			undefined
		);

		return json(result);
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		return json({ error: 'Failed to open subscription portal. Please try again.' }, { status: 500 });
	}
};
