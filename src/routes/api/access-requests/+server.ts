import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAccessRequestHeardAbout } from '$lib/accessRequests';
import { getAdminClient } from '$lib/server/supabase';
import { sanitizeString, validateEmail } from '$lib/server/validation';
import { createSupabaseAccessRequestSetupDeliveryService } from '$lib/server/accessRequestSetupDelivery';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const email = sanitizeString(body.email, 254);
	const firstName = sanitizeString(body.firstName, 80);
	const lastName = sanitizeString(body.lastName, 80);
	const reason = sanitizeString(body.reason, 1000);
	const heardAbout = sanitizeString(body.heardAbout, 80);
	const heardAboutDetails = sanitizeString(body.heardAboutDetails, 500);

	if (!email || !firstName || !lastName) {
		throw error(400, 'Email, first name, and last name are required');
	}

	if (!validateEmail(email)) {
		throw error(400, 'Invalid email format');
	}

	if (!isAccessRequestHeardAbout(heardAbout)) {
		throw error(400, 'Select how you heard about TroopToTask');
	}

	const adminClient = getAdminClient();
	const service = createSupabaseAccessRequestSetupDeliveryService(adminClient);

	try {
		const result = await service.submitAccessRequest({
			email,
			firstName,
			lastName,
			reason: reason || null,
			heardAbout,
			heardAboutDetails: heardAboutDetails || null,
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
