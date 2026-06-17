import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { isBillingEnabled } from '$lib/config/billing';
import { buildRouteContext, handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { portal } from '$lib/server/core/useCases/billing';
import { makePublicAppUrl } from '$lib/server/publicAppOrigin';
import { billingApiErrorResponse } from '../billingApiErrors';
import { resolvePortalCustomerId } from './portalAccess.server';

export const POST: RequestHandler = async (event) => {
	if (!isBillingEnabled) {
		return json({ error: 'Billing is not enabled' }, { status: 400 });
	}

	try {
		const ctx = await buildRouteContext(event);

		const { orgId } = event.params;
		const returnUrl = makePublicAppUrl(`/org/${orgId}/billing`, { inboundOrigin: event.url.origin });

		const result = await handleUseCaseRequest(
			{
				policyAction: POLICY_ACTION_CATALOG.organization.manageBilling,
				mutation: true,
				readOnlyModeException: 'billing-recovery',
				fn: async (c) => {
					const customerId = await resolvePortalCustomerId(c);
					return portal(c, {
						customerId,
						returnUrl
					});
				},
				audit: { action: 'billing.portal', resourceType: 'organization' }
			},
			ctx,
			undefined
		);

		return json(result);
	} catch (err) {
		return billingApiErrorResponse(err, 'Failed to open subscription portal. Please try again.');
	}
};
