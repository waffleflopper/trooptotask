import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isBillingEnabled } from '$lib/config/billing';
import { buildRouteContext, handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { portal } from '$lib/server/core/useCases/billing';
import { fail } from '$lib/server/core/errors';

export const POST: RequestHandler = async (event) => {
	if (!isBillingEnabled) {
		return json({ error: 'Billing is not enabled' }, { status: 400 });
	}

	try {
		const ctx = await buildRouteContext(event);
		const { orgId } = event.params;

		const { data: org } = await event.locals.supabase
			.from('organizations')
			.select('stripe_customer_id')
			.eq('id', orgId)
			.single();

		if (!org?.stripe_customer_id) {
			fail(400, 'No active subscription found for this organization');
		}

		const result = await handleUseCaseRequest(
			{
				permission: 'owner',
				mutation: true,
				fn: (c) =>
					portal(c, {
						customerId: org.stripe_customer_id,
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
