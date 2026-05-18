import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminClient } from '$lib/server/supabase';
import { sanitizeString, validateEmail } from '$lib/server/validation';
import { createSupabaseAccessRequestSetupDeliveryService } from '$lib/server/accessRequestSetupDelivery';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const email = sanitizeString(body.email, 254);
	const name = sanitizeString(body.name);
	const reason = sanitizeString(body.reason, 1000);

	if (!email || !name) {
		throw error(400, 'Email and name are required');
	}

	if (!validateEmail(email)) {
		throw error(400, 'Invalid email format');
	}

	const adminClient = getAdminClient();
	const service = createSupabaseAccessRequestSetupDeliveryService(adminClient);

	try {
		const result = await service.submitAccessRequest({
			email,
			name,
			reason: reason || null,
			origin: new URL(request.url).origin
		});

		if (result.status === 'already-pending') {
			throw error(409, 'A request for this email is already pending');
		}
	} catch (submitError) {
		if (submitError && typeof submitError === 'object' && 'status' in submitError) {
			throw submitError;
		}
		console.error('Failed to submit access request:', submitError);
		throw error(500, 'Failed to submit request');
	}

	return json({ success: true });
};
