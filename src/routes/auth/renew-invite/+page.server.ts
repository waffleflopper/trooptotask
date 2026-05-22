import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getAdminClient } from '$lib/server/supabase';
import { createSupabaseAccessRequestSetupDeliveryService } from '$lib/server/accessRequestSetupDelivery';
import {
	ACCOUNT_SETUP_RENEWAL_RATE_LIMIT_MESSAGE,
	checkAccountSetupRenewalRateLimit
} from '$lib/server/accountSetupRateLimit';
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
	default: async ({ getClientAddress, request, url }) => {
		const formData = await request.formData();
		const rawEmail = formData.get('email');
		const email = sanitizeString(typeof rawEmail === 'string' ? rawEmail : null, 254);

		if (!email) {
			return fail(400, { error: 'Email is required', email });
		}

		if (!validateEmail(email)) {
			return fail(400, { error: 'Enter a valid email address', email });
		}

		const rateLimit = await checkAccountSetupRenewalRateLimit({
			email,
			ip: getClientAddress()
		});
		if (rateLimit.limited) {
			return fail(429, {
				error: ACCOUNT_SETUP_RENEWAL_RATE_LIMIT_MESSAGE,
				email
			});
		}

		try {
			await createSupabaseAccessRequestSetupDeliveryService(getAdminClient()).requestFreshSetupLink({
				email,
				origin: url.origin
			});
		} catch (error) {
			console.error('Failed to renew approved access request setup link:', error);
			return fail(500, {
				error: 'We could not send a fresh Account Setup Link right now. Please try again in a few minutes.',
				email
			});
		}

		return { success: true, email };
	}
};
