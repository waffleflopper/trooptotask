import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { RequestHandler } from './$types';
import { auditLog } from '$lib/server/auditLog';
import {
	checkPasswordUpdateRateLimit,
	PASSWORD_UPDATE_RATE_LIMIT_MESSAGE,
	passwordUpdateRateLimitAuditDetails
} from '$lib/server/passwordUpdateRateLimit';
import { mapProviderPasswordError, validatePassword } from '$lib/server/validation';
import { isMfaStepUpRequired, getPendingAuthFlowCookieName } from '$lib/server/mfaGate';

export const POST: RequestHandler = async ({ request, locals, cookies, getClientAddress }) => {
	const { user, session } = locals;
	const inactiveSession = () =>
		json(
			{ error: 'Your account recovery session is no longer active. Please reopen the link and try again.' },
			{ status: 401 }
		);
	// Identity comes from the verified request hook, never a session-user fallback or request payload.
	if (
		typeof user?.id !== 'string' ||
		!user.id ||
		session?.user?.id !== user.id ||
		typeof session.access_token !== 'string' ||
		!/^\S+$/.test(session.access_token) ||
		typeof session.expires_at !== 'number' ||
		!Number.isFinite(session.expires_at) ||
		session.expires_at <= Date.now() / 1000
	) {
		return inactiveSession();
	}
	const userId = user.id;
	const userEmail = typeof user.email === 'string' ? user.email : null;
	const body: unknown = await request.json().catch(() => null);
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return json({ error: 'Invalid password update request' }, { status: 400 });
	}
	const { currentPassword, password, confirmPassword } = body as Record<string, unknown>;
	if (typeof password !== 'string') {
		return json({ error: 'New password is required' }, { status: 400 });
	}
	const passwordError = validatePassword(password);
	if (passwordError) {
		return json({ error: passwordError }, { status: 400 });
	}
	if (session.expires_at <= Date.now() / 1000) return inactiveSession();

	const isRecoveryOrInviteFlow = locals.authFlow === 'recovery' || locals.authFlow === 'invite';

	if (!isRecoveryOrInviteFlow) {
		if (typeof currentPassword !== 'string' || !currentPassword) {
			return json({ error: 'Current password is required' }, { status: 400 });
		}

		if (typeof confirmPassword !== 'string' || password !== confirmPassword) {
			return json({ error: 'New passwords do not match' }, { status: 400 });
		}

		const email = userEmail;
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
		if (session.expires_at <= Date.now() / 1000) return inactiveSession();

		const proof = await verifyPasswordProof(userId, email, currentPassword).catch(() => 'unavailable' as const);
		if (proof === 'incorrect') {
			return json({ error: 'Current password is incorrect' }, { status: 401 });
		}
		if (proof !== 'accepted') {
			return json({ error: 'Unable to verify your current password. Please try again.' }, { status: 503 });
		}
		if (session.expires_at <= Date.now() / 1000) return inactiveSession();
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
		if (session.expires_at <= Date.now() / 1000) return inactiveSession();
	}

	// Proof has its own AAL1 token. Authorize the mutation using the original admitted token,
	// reading fresh provider facts after proof/limiter work rather than trusting hook state.
	try {
		const assurance = await locals.supabase.auth.mfa.getAuthenticatorAssuranceLevel(session.access_token);
		if (
			assurance?.error !== null ||
			!['aal1', 'aal2'].includes(assurance.data?.currentLevel ?? '') ||
			!['aal1', 'aal2'].includes(assurance.data?.nextLevel ?? '')
		) {
			return json({ error: 'Unable to verify authentication status. Please try again.' }, { status: 503 });
		}
		if (session.expires_at <= Date.now() / 1000) return inactiveSession();
		if (isMfaStepUpRequired(assurance.data)) {
			return json(
				{ code: 'mfa_required', error: 'Verify your authenticator code before changing your password.' },
				{ status: 403 }
			);
		}
	} catch {
		return json({ error: 'Unable to verify authentication status. Please try again.' }, { status: 503 });
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

	// Rotating the password logs out other devices so a compromised session cannot persist.
	const { error: revokeError } = await locals.supabase.auth.signOut({ scope: 'others' });
	if (revokeError) {
		auditLog(
			{
				action: 'auth.session_revoke_failed',
				resourceType: 'user',
				resourceId: userId ?? undefined,
				severity: 'warning',
				details: {}
			},
			{ userId }
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

async function verifyPasswordProof(
	userId: string,
	email: string,
	password: string
): Promise<'accepted' | 'incorrect' | 'unavailable'> {
	// Password sign-in creates an AAL1 session. Keep it isolated so it cannot replace the
	// admitted actor or downgrade an existing AAL2 session used by updateUser below.
	const proof = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
	});
	let outcome: 'accepted' | 'incorrect' | 'unavailable' = 'unavailable';
	let expiresAt = 0;
	try {
		const result = await proof.auth.signInWithPassword({ email, password });
		const issued = result?.data?.session;
		if (result?.error && [400, 401, 403].includes(result.error.status ?? 0)) {
			outcome = 'incorrect';
		} else if (
			result?.error === null &&
			result.data?.user?.id === userId &&
			issued?.user?.id === userId &&
			typeof issued.access_token === 'string' &&
			/^\S+$/.test(issued.access_token) &&
			typeof issued.refresh_token === 'string' &&
			/^\S+$/.test(issued.refresh_token) &&
			typeof issued.expires_at === 'number' &&
			Number.isFinite(issued.expires_at) &&
			issued.expires_at > Date.now() / 1000
		) {
			expiresAt = issued.expires_at;
			const identity = await proof.auth.getUser(issued.access_token);
			if (identity?.error === null && identity.data?.user?.id === userId) {
				const assurance = await proof.auth.mfa.getAuthenticatorAssuranceLevel(issued.access_token);
				if (
					assurance?.error === null &&
					['aal1', 'aal2'].includes(assurance.data?.currentLevel ?? '') &&
					['aal1', 'aal2'].includes(assurance.data?.nextLevel ?? '')
				)
					outcome = 'accepted';
			}
		}
	} catch {
		// Provider exceptions can contain credentials. Fail closed without logging them.
	}
	// Revoke only this temporary proof session, including on malformed/error results.
	// Never let a failed proof clear the request session or other browser sessions.
	try {
		const revoked = await proof.auth.signOut({ scope: 'local' });
		if (revoked?.error !== null) return 'unavailable';
	} catch {
		return 'unavailable';
	}
	return outcome === 'accepted' && expiresAt <= Date.now() / 1000 ? 'unavailable' : outcome;
}
