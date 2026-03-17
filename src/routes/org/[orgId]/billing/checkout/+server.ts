import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isBillingEnabled } from '$lib/config/billing';
import { createCheckoutSession } from '$lib/server/stripe';

export const POST: RequestHandler = async ({ params, request, locals, url }) => {
	if (!isBillingEnabled) {
		return json({ error: 'Billing is not enabled' }, { status: 400 });
	}

	const user = locals.user;
	if (!user) {
		throw error(401, 'Not authenticated');
	}

	const { orgId } = params;

	// Verify user is the org owner
	const { data: membership } = await locals.supabase
		.from('organization_memberships')
		.select('role')
		.eq('organization_id', orgId)
		.eq('user_id', user.id)
		.single();

	if (membership?.role !== 'owner') {
		throw error(403, 'Only the organization owner can manage billing');
	}

	const body = await request.json();
	const { tier } = body;

	if (tier !== 'team' && tier !== 'unit') {
		return json({ error: 'Invalid tier. Must be "team" or "unit".' }, { status: 400 });
	}

	// Get org details
	const { data: org } = await locals.supabase
		.from('organizations')
		.select('id, name, stripe_customer_id')
		.eq('id', orgId)
		.single();

	if (!org) {
		throw error(404, 'Organization not found');
	}

	const email = user.email;
	if (!email) {
		return json({ error: 'User email not found' }, { status: 400 });
	}

	try {
		const { url: checkoutUrl, customerId } = await createCheckoutSession({
			orgId,
			orgName: org.name,
			tier,
			customerEmail: email,
			existingCustomerId: org.stripe_customer_id ?? undefined,
			successUrl: `${url.origin}/org/${orgId}/billing/success`,
			cancelUrl: `${url.origin}/org/${orgId}/billing/canceled`
		});

		// Persist customer ID immediately to prevent duplicate customers on retry
		if (!org.stripe_customer_id) {
			await locals.supabase.from('organizations').update({ stripe_customer_id: customerId }).eq('id', orgId);
		}

		return json({ url: checkoutUrl });
	} catch (err) {
		console.error('Stripe checkout error:', err);
		return json({ error: 'Failed to create checkout session. Please try again.' }, { status: 500 });
	}
};
