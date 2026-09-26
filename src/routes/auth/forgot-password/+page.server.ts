import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	FORGOT_PASSWORD_RATE_LIMIT_MESSAGE,
	getAuthenticatedRedirectPath,
	requestPublicPasswordRecovery
} from '$features/identity/index.server';
import { auditLog } from '$lib/audit/index.server';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.session) {
		redirect(303, getAuthenticatedRedirectPath(locals.authFlow, locals.mfaPending));
	}
	return {};
};

export const actions: Actions = {
	default: async ({ getClientAddress, request, url }) => {
		const formData = await request.formData();
		const result = await requestPublicPasswordRecovery(
			{
				email: formData.get('email'),
				clientAddress: getClientAddress,
				origin: url.origin,
				userAgent: request.headers.get('user-agent') ?? ''
			},
			{ audit: auditLog }
		);
		if (result.status === 'invalid-email') {
			return fail(400, { error: 'Enter a valid email address', email: result.email });
		}
		if (result.status === 'rate-limited') {
			return fail(429, {
				error: FORGOT_PASSWORD_RATE_LIMIT_MESSAGE,
				email: result.email
			});
		}
		return { success: true, email: result.email };
	}
};
