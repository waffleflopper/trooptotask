import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getAdminClient } from '$lib/server/supabase';
import { renewApprovedAccessRequestInvite } from '$lib/server/accessRequestAuth';
import { sanitizeString, validateEmail } from '$lib/server/validation';
import { getAuthenticatedRedirectPath } from '$lib/server/mfaGate';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.session) {
		redirect(303, getAuthenticatedRedirectPath(locals.authFlow, locals.mfaPending));
	}

	return {
		email: sanitizeString(url.searchParams.get('email'), 254)
	};
};

export const actions: Actions = {
	default: async ({ request, url }) => {
		const formData = await request.formData();
		const rawEmail = formData.get('email');
		const email = sanitizeString(typeof rawEmail === 'string' ? rawEmail : null, 254);

		if (!email) {
			return fail(400, { error: 'Email is required', email });
		}

		if (!validateEmail(email)) {
			return fail(400, { error: 'Enter a valid email address', email });
		}

		try {
			await renewApprovedAccessRequestInvite(getAdminClient(), email, url.origin);
		} catch (error) {
			console.error('Failed to renew approved access request invite:', error);
			return fail(500, {
				error: 'We could not send a fresh invite right now. Please try again in a few minutes.',
				email
			});
		}

		return { success: true, email };
	}
};
