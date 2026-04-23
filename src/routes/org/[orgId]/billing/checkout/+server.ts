import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isBillingEnabled } from '$lib/config/billing';
import { buildRouteContext, handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { checkout } from '$lib/server/core/useCases/billing';
import { persistBillingCustomerId, readBillingOrganization } from '$lib/server/core/useCases/billingOrganization';
import { fail } from '$lib/server/core/errors';

export const POST: RequestHandler = async (event) => {
	if (!isBillingEnabled) {
		return json({ error: 'Billing is not enabled' }, { status: 400 });
	}

	try {
		const ctx = await buildRouteContext(event);
		const { orgId } = event.params;

		const body = await event.request.json();
		const tier = body.tier;
		if (tier !== 'team' && tier !== 'unit') {
			fail(400, 'Invalid tier. Must be "team" or "unit".');
		}

		const org = await readBillingOrganization({ auth: ctx.auth, store: ctx.rawStore });

		const email = event.locals.user?.email;
		if (!email) fail(400, 'User email not found');

		const result = await handleUseCaseRequest(
			{
				permission: 'owner',
				mutation: true,
				fn: (c) =>
					checkout(c, {
						tier,
						customerEmail: email,
						orgName: org.name,
						existingCustomerId: org.stripeCustomerId ?? undefined,
						successUrl: `${event.url.origin}/org/${orgId}/billing/success`,
						cancelUrl: `${event.url.origin}/org/${orgId}/billing/canceled`
					}),
				audit: { action: 'billing.checkout', resourceType: 'organization' }
			},
			ctx,
			undefined
		);

		if (!org.stripeCustomerId) {
			await persistBillingCustomerId({ auth: ctx.auth, store: ctx.rawStore }, { customerId: result.customerId });
		}

		return json({ url: result.url });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		return json({ error: 'Failed to create checkout session. Please try again.' }, { status: 500 });
	}
};
