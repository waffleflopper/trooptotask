import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auditLog } from '$lib/server/auditLog';
import {
	checkPasswordUpdateRateLimit,
	PASSWORD_UPDATE_RATE_LIMIT_MESSAGE,
	passwordUpdateRateLimitAuditDetails
} from '$lib/server/passwordUpdateRateLimit';
import { mapProviderPasswordError, validatePassword } from '$lib/server/validation';
import { getPendingAuthFlowCookieName } from '$lib/server/mfaGate';

export const POST: RequestHandler = async ({ request, locals, cookies, getClientAddress }) => {
	const { currentPassword, password, confirmPassword } = (await request.json()) as {
		currentPassword?: string;
		password?: string;
		confirmPassword?: string;
	};

	const passwordError = validatePassword(password ?? '');
	if (passwordError) {
		return json(
			{
				error: passwordError
			},
			{ status: 400 }
		);
	}

	if (!locals.session) {
		return json(
			{
				error: 'Your account recovery session is no longer active. Please reopen the link and try again.'
			},
			{ status: 401 }
		);
	}

	const isRecoveryOrInviteFlow = locals.authFlow === 'recovery' || locals.authFlow === 'invite';

	if (!isRecoveryOrInviteFlow) {
		if (!currentPassword) {
			return json({ error: 'Current password is required' }, { status: 400 });
		}

		if (password !== confirmPassword) {
			return json({ error: 'New passwords do not match' }, { status: 400 });
		}

		const email = locals.user?.email;
		if (!email) {
			return json({ error: 'Current user email is unavailable' }, { status: 401 });
		}

		const clientIp = getClientAddress();
		const rateLimit = await checkPasswordUpdateRateLimit({
			userId: locals.user?.id ?? locals.session.user.id,
			ip: clientIp
		});
		if (rateLimit.limited) {
			const retryAfterSeconds = Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000));
			auditLog(
				{
					action: 'auth.password_update_rate_limited',
					resourceType: 'user',
					resourceId: locals.user?.id ?? locals.session.user.id,
					severity: 'warning',
					details: passwordUpdateRateLimitAuditDetails(rateLimit)
				},
				{
					userId: locals.user?.id ?? locals.session.user.id,
					userEmail: email,
					ip: clientIp,
					userAgent: request.headers.get('user-agent') ?? ''
				}
			);
			return json(
				{
					error: PASSWORD_UPDATE_RATE_LIMIT_MESSAGE,
					retryAfterSeconds
				},
				{
					status: 429,
					headers: {
						'Retry-After': String(retryAfterSeconds)
					}
				}
			);
		}

		const { error: signInError } = await locals.supabase.auth.signInWithPassword({
			email,
			password: currentPassword
		});

		if (signInError) {
			return json({ error: 'Current password is incorrect' }, { status: 401 });
		}
	}

	const { error } = await locals.supabase.auth.updateUser({ password });

	if (error) {
		const providerPasswordError = mapProviderPasswordError(error);
		if (providerPasswordError) {
			return json({ error: providerPasswordError }, { status: 400 });
		}
		return json(
			{
				error: 'Password update failed'
			},
			{ status: 401 }
		);
	}

	if (locals.authFlow === 'recovery') {
		cookies.delete(getPendingAuthFlowCookieName(), { path: '/' });
	}

	return json({ ok: true });
};
