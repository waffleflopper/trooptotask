import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getAuthenticatedRedirectPath } from '$lib/server/mfaGate';
import { sanitizeString } from '$lib/server/validation';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.session) {
		redirect(303, getAuthenticatedRedirectPath(locals.authFlow, locals.mfaPending));
	}

	return {
		email: sanitizeString(url.searchParams.get('email'), 254),
		hadInviteCode: Boolean(url.searchParams.get('code'))
	};
};

export const actions: Actions = {
	default: async () => {
		return fail(410, {
			error:
				'Invite-code registration is no longer used for beta account setup. Use your Account Setup Link, request a fresh setup link, or request access.'
		});
	}
};
