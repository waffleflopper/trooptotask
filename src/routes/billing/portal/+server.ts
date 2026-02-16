import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createPortalSession } from '$lib/server/stripe';
import { getUserSubscription } from '$lib/server/subscription';

export const POST: RequestHandler = async ({ locals, url }) => {
	const user = locals.user;
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	// Get user's subscription to find Stripe customer ID
	const subData = await getUserSubscription(locals.supabase, user.id);

	if (!subData?.subscription.stripeCustomerId) {
		throw error(400, 'No billing account found. Please subscribe to a plan first.');
	}

	// Create portal session
	const baseUrl = url.origin;
	const session = await createPortalSession(
		subData.subscription.stripeCustomerId,
		`${baseUrl}/billing`
	);

	return json({
		portalUrl: session.url
	});
};
