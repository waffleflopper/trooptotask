import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isBillingEnabled } from '$lib/config/billing';
import { buildRouteContext, handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { cancel } from '$lib/server/core/useCases/billing';
import { applyBillingCancellation, readBillingOrganization } from '$lib/server/core/useCases/billingOrganization';
import { fail } from '$lib/server/core/errors';

export const POST: RequestHandler = async (event) => {
	if (!isBillingEnabled) {
		return json({ error: 'Billing is not enabled' }, { status: 400 });
	}

	try {
		const ctx = await buildRouteContext(event);
		const org = await readBillingOrganization({ auth: ctx.auth, store: ctx.rawStore });
		const subscriptionId = org.stripeSubscriptionId;

		if (!subscriptionId) {
			fail(400, 'No active subscription found');
		}

		const result = await handleUseCaseRequest(
			{
				permission: 'owner',
				mutation: true,
				fn: (c) => cancel(c, { subscriptionId }),
				audit: { action: 'billing.cancel', resourceType: 'organization' }
			},
			ctx,
			undefined
		);

		await applyBillingCancellation({ auth: ctx.auth, store: ctx.rawStore }, result);

		return json({ success: true });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		return json({ error: 'Failed to cancel subscription. Please try again.' }, { status: 500 });
	}
};
