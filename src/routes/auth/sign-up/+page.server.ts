import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isBillingEnabled } from '$lib/config/billing';
import { auditLog } from '$lib/server/auditLog';
import { durableRateLimitAuditDetails } from '$lib/server/durableRateLimit';
import { getAuthConfirmRedirectTo } from '$lib/server/authConfirm';
import { getAuthenticatedRedirectPath } from '$lib/server/mfaGate';
import { createSupabaseSignupAuthProvider } from '$lib/server/signupAuthProvider';
import { checkSignupRateLimit, SIGNUP_RATE_LIMIT_MESSAGE } from '$lib/server/signupRateLimit';
import { mapProviderPasswordError, sanitizeString, validateEmail, validatePassword } from '$lib/server/validation';

export const SIGNUP_SUCCESS_MESSAGE = 'If this email can create a TroopToTask account, we sent a confirmation link.';
export const SIGNUP_PROVIDER_ERROR_MESSAGE = 'We could not start account creation. Please try again later.';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.session) {
		redirect(303, getAuthenticatedRedirectPath(locals.authFlow, locals.mfaPending));
	}

	if (!isBillingEnabled) {
		redirect(303, '/auth/request-access');
	}

	return {};
};

export const actions: Actions = {
	default: async ({ getClientAddress, locals, request, url }) => {
		if (locals.session) {
			redirect(303, getAuthenticatedRedirectPath(locals.authFlow, locals.mfaPending));
		}

		if (!isBillingEnabled) {
			redirect(303, '/auth/request-access');
		}

		const formData = await request.formData();
		const email = sanitizeString(formData.get('email')?.toString(), 254).toLowerCase();
		const password = formData.get('password')?.toString() ?? '';
		const confirmPassword = formData.get('confirmPassword')?.toString() ?? '';

		if (!email || !validateEmail(email)) {
			return fail(400, { error: 'Enter a valid email address', email });
		}

		const passwordError = validatePassword(password);
		if (passwordError) {
			return fail(400, { error: passwordError, email });
		}

		if (password !== confirmPassword) {
			return fail(400, { error: 'Passwords must match', email });
		}

		const clientIp = getClientAddress();
		const rateLimit = await checkSignupRateLimit({
			email,
			ip: clientIp
		});
		if (rateLimit.limited) {
			auditLog(
				{
					action: 'auth.signup_rate_limited',
					resourceType: 'user',
					severity: 'warning',
					details: durableRateLimitAuditDetails(rateLimit)
				},
				{
					userId: null,
					ip: clientIp,
					userAgent: request.headers.get('user-agent') ?? ''
				}
			);
			return fail(429, {
				error: SIGNUP_RATE_LIMIT_MESSAGE,
				email
			});
		}

		const redirectTo = getAuthConfirmRedirectTo(url.origin, 'email');
		const { error } = await createSupabaseSignupAuthProvider(locals).signUp({
			email,
			password,
			emailRedirectTo: redirectTo
		});

		if (error) {
			const passwordProviderError = mapProviderPasswordError(error);
			if (passwordProviderError) {
				return fail(400, { error: passwordProviderError, email });
			}

			if (isDuplicateSignupError(error)) {
				return { success: true, email, message: SIGNUP_SUCCESS_MESSAGE };
			}

			console.error('Signup error:', error);
			return fail(400, { error: SIGNUP_PROVIDER_ERROR_MESSAGE, email });
		}

		return { success: true, email, message: SIGNUP_SUCCESS_MESSAGE };
	}
};

function isDuplicateSignupError(error: unknown): boolean {
	const code = getStringProperty(error, 'code').toLowerCase();
	const name = getStringProperty(error, 'name').toLowerCase();
	const message = getStringProperty(error, 'message').toLowerCase();

	return (
		code === 'user_already_exists' ||
		code === 'email_exists' ||
		(name === 'authapierror' && message.includes('already')) ||
		message.includes('already registered') ||
		message.includes('already exists')
	);
}

function getStringProperty(value: unknown, property: string): string {
	if (!value || typeof value !== 'object') return '';
	const propertyValue = Reflect.get(value, property);
	return typeof propertyValue === 'string' ? propertyValue : '';
}
