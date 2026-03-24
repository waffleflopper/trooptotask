import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isBillingEnabled } from '$lib/config/billing';
import { buildRouteContext, handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { cancel } from '$lib/server/core/useCases/billing';
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
			.select('stripe_subscription_id')
			.eq('id', orgId)
			.single();

		if (!org?.stripe_subscription_id) {
			fail(400, 'No active subscription found');
		}

		const result = await handleUseCaseRequest(
			{
				permission: 'owner',
				mutation: true,
				fn: (c) => cancel(c, { subscriptionId: org.stripe_subscription_id }),
				audit: { action: 'billing.cancel', resourceType: 'organization' }
			},
			ctx,
			undefined
		);

		await event.locals.supabase.from('organizations').update(result.orgUpdates).eq('id', orgId);

		return json({ success: true });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		return json({ error: 'Failed to cancel subscription. Please try again.' }, { status: 500 });
	}
};
