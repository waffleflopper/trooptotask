import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { isBillingEnabled } from '$lib/config/billing';
import { buildRouteContext, handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import {
	CheckoutConfigurationError,
	resolveCheckoutSessionConfiguration
} from '$lib/server/billing/checkoutConfiguration';
import { getConfiguredPriceCatalog, lookupCheckoutPriceCatalogEntry } from '$lib/server/billing/priceCatalog';
import { checkout } from '$lib/server/core/useCases/billing';
import {
	canManageBillingSubscription,
	persistBillingCustomerId,
	readBillingOrganization
} from '$lib/server/core/useCases/billingOrganization';
import { fail } from '$lib/server/core/errors';
import { makePublicAppUrl } from '$lib/server/publicAppOrigin';
import { billingApiErrorResponse } from '../billingApiErrors';

export const POST: RequestHandler = async (event) => {
	if (!isBillingEnabled) {
		return json({ error: 'Billing is not enabled' }, { status: 400 });
	}

	try {
		const ctx = await buildRouteContext(event);

		const { orgId } = event.params;

		const body = await event.request.json().catch(() => null);
		if (!body || typeof body !== 'object' || Array.isArray(body)) {
			fail(400, 'Invalid checkout request.');
		}
		if (typeof body.priceId === 'string' && body.priceId.trim()) {
			fail(400, 'Stripe price IDs cannot be selected directly.');
		}
		const checkoutPrice = lookupCheckoutPriceCatalogEntry(getConfiguredPriceCatalog(), body.tier);
		if (!checkoutPrice.ok) {
			if (checkoutPrice.reason === 'unsupported_plan') {
				fail(400, 'Invalid tier. Must be "team" or "unit".');
			}
			if (checkoutPrice.reason === 'missing_price_id') {
				console.error(`No Stripe price ID configured for tier: ${checkoutPrice.commercialPlan}`);
				fail(500, 'Checkout is temporarily unavailable.');
			}
			console.error(`Multiple Stripe checkout price IDs configured for tier: ${checkoutPrice.commercialPlan}`);
			fail(500, 'Checkout is temporarily unavailable.');
		}
		const tier = checkoutPrice.entry.commercialPlan;

		const successUrl = makePublicAppUrl(`/org/${orgId}/billing/success`, { inboundOrigin: event.url.origin });
		const cancelUrl = makePublicAppUrl(`/org/${orgId}/billing/canceled`, { inboundOrigin: event.url.origin });
		let checkoutConfiguration;
		try {
			checkoutConfiguration = resolveCheckoutSessionConfiguration();
		} catch (configError) {
			if (configError instanceof CheckoutConfigurationError) {
				console.error(`[billing-checkout] ${configError.message}`);
				fail(500, 'Checkout tax configuration needs support review before checkout can start.');
			}
			throw configError;
		}
		const email = event.locals.user?.email;
		if (!email) fail(400, 'User email not found');

		const result = await handleUseCaseRequest(
			{
				policyAction: POLICY_ACTION_CATALOG.organization.manageBilling,
				mutation: true,
				readOnlyModeException: 'billing-recovery',
				fn: async (c) => {
					const org = await readBillingOrganization({ auth: c.auth, store: c.rawStore });
					if (canManageBillingSubscription(org)) {
						fail(409, 'This organization already has a paid subscription. Use Manage Subscription to change plans.');
					}
					const checkoutResult = await checkout(c, {
						tier,
						priceId: checkoutPrice.entry.priceId,
						customerEmail: email,
						orgName: org.name,
						existingCustomerId: org.stripeCustomerId ?? undefined,
						successUrl,
						cancelUrl,
						checkoutConfiguration
					});
					return {
						...checkoutResult,
						existingCustomerId: org.stripeCustomerId
					};
				},
				audit: { action: 'billing.checkout', resourceType: 'organization' }
			},
			ctx,
			undefined
		);

		if (!result.existingCustomerId && result.customerId) {
			await persistBillingCustomerId({ auth: ctx.auth, store: ctx.rawStore }, { customerId: result.customerId });
		}

		return json({
			url: result.url,
			...(result.reused ? { reused: true, message: result.message } : {})
		});
	} catch (err) {
		return billingApiErrorResponse(err, 'Failed to create checkout session. Please try again.');
	}
};
