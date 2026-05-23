import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { auditLog } from '$lib/server/auditLog';
import { getAuthenticatedRedirectPath } from '$lib/server/mfaGate';
import { getAuthConfirmRedirectTo } from '$lib/server/authConfirm';
import {
	checkForgotPasswordRateLimit,
	FORGOT_PASSWORD_RATE_LIMIT_MESSAGE,
	forgotPasswordRateLimitAuditDetails
} from '$lib/server/forgotPasswordRateLimit';
import { sanitizeString, validateEmail } from '$lib/server/validation';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.session) {
		redirect(303, getAuthenticatedRedirectPath(locals.authFlow, locals.mfaPending));
	}
	return {};
};

export const actions: Actions = {
	default: async ({ getClientAddress, request, locals, url }) => {
		const formData = await request.formData();
		const emailValue = formData.get('email');
		const email = sanitizeString(typeof emailValue === 'string' ? emailValue : null, 254);

		if (!email || !validateEmail(email)) {
			return fail(400, { error: 'Enter a valid email address', email });
		}

		const clientIp = getClientAddress();
		const rateLimit = await checkForgotPasswordRateLimit({
			email,
			ip: clientIp
		});
		if (rateLimit.limited) {
			auditLog(
				{
					action: 'auth.forgot_password_rate_limited',
					resourceType: 'user',
					severity: 'warning',
					details: forgotPasswordRateLimitAuditDetails(rateLimit)
				},
				{
					userId: null,
					userEmail: email,
					ip: clientIp,
					userAgent: request.headers.get('user-agent') ?? ''
				}
			);
			return fail(429, {
				error: FORGOT_PASSWORD_RATE_LIMIT_MESSAGE,
				email
			});
		}

		const redirectTo = getAuthConfirmRedirectTo(url.origin, 'recovery');

		const { error } = await locals.supabase.auth.resetPasswordForEmail(email, {
			redirectTo
		});

		if (error) {
			return fail(400, { error: 'We could not send a recovery email. Please try again later.', email });
		}

		return { success: true, email };
	}
};
