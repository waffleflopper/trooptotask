import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isBillingEnabled } from '$lib/config/billing';
import { createPortalSession } from '$lib/server/stripe';

export const POST: RequestHandler = async ({ params, locals, url }) => {
	if (!isBillingEnabled) {
		return json({ error: 'Billing is not enabled' }, { status: 400 });
	}

	const { session } = await locals.safeGetSession();
	if (!session?.user) {
		throw error(401, 'Not authenticated');
	}

	const { orgId } = params;

	// Verify user is the org owner
	const { data: membership } = await locals.supabase
		.from('organization_memberships')
		.select('role')
		.eq('organization_id', orgId)
		.eq('user_id', session.user.id)
		.single();

	if (membership?.role !== 'owner') {
		throw error(403, 'Only the organization owner can manage billing');
	}

	// Get org's Stripe customer ID
	const { data: org } = await locals.supabase
		.from('organizations')
		.select('stripe_customer_id')
		.eq('id', orgId)
		.single();

	if (!org?.stripe_customer_id) {
		return json({ error: 'No active subscription found for this organization' }, { status: 400 });
	}

	try {
		const portalUrl = await createPortalSession(
			org.stripe_customer_id,
			`${url.origin}/org/${orgId}/billing`
		);

		return json({ url: portalUrl });
	} catch (err) {
		console.error('Stripe portal error:', err);
		return json(
			{ error: 'Failed to open subscription portal. Please try again.' },
			{ status: 500 }
		);
	}
};
