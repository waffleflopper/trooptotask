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
	const userId = locals.user?.id ?? locals.session?.user.id ?? null;
	const userEmail = locals.user?.email ?? locals.session?.user.email ?? null;

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

		const limitedResponse = await checkAndAuditPasswordUpdateLimit({
			request,
			getClientAddress,
			userId,
			userEmail: email
		});
		if (limitedResponse) {
			return limitedResponse;
		}

		const { error: signInError } = await locals.supabase.auth.signInWithPassword({
			email,
			password: currentPassword
		});

		if (signInError) {
			return json({ error: 'Current password is incorrect' }, { status: 401 });
		}
	} else {
		const limitedResponse = await checkAndAuditPasswordUpdateLimit({
			request,
			getClientAddress,
			userId,
			userEmail
		});
		if (limitedResponse) {
			return limitedResponse;
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

async function checkAndAuditPasswordUpdateLimit(input: {
	request: Request;
	getClientAddress: () => string;
	userId: string | null;
	userEmail?: string | null;
}): Promise<Response | null> {
	if (!input.userId) {
		return json({ error: 'Current user is unavailable' }, { status: 401 });
	}

	const clientIp = input.getClientAddress();
	const rateLimit = await checkPasswordUpdateRateLimit({
		userId: input.userId,
		ip: clientIp
	});
	if (!rateLimit.limited) {
		return null;
	}

	const retryAfterSeconds = Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000));
	auditLog(
		{
			action: 'auth.password_update_rate_limited',
			resourceType: 'user',
			resourceId: input.userId,
			severity: 'warning',
			details: passwordUpdateRateLimitAuditDetails(rateLimit)
		},
		{
			userId: input.userId,
			userEmail: input.userEmail ?? null,
			ip: clientIp,
			userAgent: input.request.headers.get('user-agent') ?? ''
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
