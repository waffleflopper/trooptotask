import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isBillingEnabled } from '$lib/config/billing';
import { cancelSubscription } from '$lib/server/stripe';
import { getAdminClient } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ params, locals }) => {
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
		throw error(403, 'Only the organization owner can cancel the subscription');
	}

	// Get org's subscription ID
	const { data: org } = await locals.supabase
		.from('organizations')
		.select('stripe_subscription_id')
		.eq('id', orgId)
		.single();

	if (!org?.stripe_subscription_id) {
		return json({ error: 'No active subscription found' }, { status: 400 });
	}

	try {
		await cancelSubscription(org.stripe_subscription_id);

		// Update org: clear subscription fields, revert to free tier
		const adminClient = getAdminClient();
		await adminClient
			.from('organizations')
			.update({
				tier: 'free',
				subscription_status: null,
				stripe_subscription_id: null
			})
			.eq('id', orgId);

		return json({ success: true });
	} catch (err) {
		console.error('Stripe cancel error:', err);
		return json(
			{ error: 'Failed to cancel subscription. Please try again.' },
			{ status: 500 }
		);
	}
};
