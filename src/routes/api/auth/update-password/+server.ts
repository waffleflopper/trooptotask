import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { RequestHandler } from './$types';
import {
	PASSWORD_COMPLETION_COOKIE,
	preparePasswordCompletion,
	readPasswordCompletion,
	writePasswordCompletion
} from '$lib/server/passwordCompletion';
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
	const { currentPassword, password, confirmPassword, action } = body as Record<string, unknown>;
	const receipt = readPasswordCompletion(cookies, locals);
	if (receipt === 'expired' || receipt === 'unavailable') {
		return json(
			{ code: 'password_completion_expired', error: 'Sign out and sign in again to continue safely.' },
			{ status: 409 }
		);
	}
	if (receipt || action !== undefined) {
		if (!receipt) return json({ error: 'No confirmed password update is awaiting completion.' }, { status: 409 });
		const limited = await checkAndAuditPasswordUpdateLimit({ request, getClientAddress, userId, userEmail });
		if (limited) return limited;
		const denied = await authorizeCompletion(locals);
		if (denied) return denied;
		if (receipt.expiresAt <= Date.now() / 1000)
			return json({ error: 'Password completion expired. Sign out and sign in again.' }, { status: 409 });
		if (action === 'restart') {
			if (receipt.state !== 'complete' || locals.authFlow)
				return json({ error: 'Finish the current password update first.' }, { status: 409 });
			cookies.delete(PASSWORD_COMPLETION_COOKIE, { path: '/' });
			return json({ ok: true });
		}
		if (action !== undefined && action !== 'complete')
			return json({ error: 'Invalid completion action.' }, { status: 400 });
		if (receipt.flow !== (locals.authFlow ?? null) && !(receipt.state === 'complete' && !locals.authFlow)) {
			return json({ error: 'The password completion flow no longer matches this session.' }, { status: 409 });
		}
		return finishPasswordCompletion(locals, cookies, receipt);
	}
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

	const denied = await authorizeCompletion(locals);
	if (denied) return denied;
	let pending: ReturnType<typeof preparePasswordCompletion>;
	try {
		pending = preparePasswordCompletion(locals);
	} catch {
		return json({ error: 'Unable to prepare password completion. Please try again.' }, { status: 503 });
	}

	const unconfirmedMutation = () =>
		json(
			{
				code: 'password_update_unconfirmed',
				error: 'Unable to confirm the password update. Your password may have changed.'
			},
			{ status: 503 }
		);
	try {
		const mutation = await locals.supabase.auth.updateUser({ password });
		if (mutation?.error) {
			const providerPasswordError = mapProviderPasswordError(mutation.error);
			if (providerPasswordError) return json({ error: providerPasswordError }, { status: 400 });
			return unconfirmedMutation();
		}
		if (mutation?.error !== null || mutation.data?.user?.id !== userId) return unconfirmedMutation();
	} catch {
		// A lost response cannot prove rollback. Never expose provider exceptions or
		// run completion effects without acknowledgment for the admitted actor.
		return unconfirmedMutation();
	}

	writePasswordCompletion(cookies, pending);
	return finishPasswordCompletion(locals, cookies, pending);
};

async function finishPasswordCompletion(
	locals: App.Locals,
	cookies: Parameters<RequestHandler>[0]['cookies'],
	receipt: ReturnType<typeof preparePasswordCompletion>
): Promise<Response> {
	if (receipt.state !== 'complete') {
		let revoked = false;
		try {
			if (receipt.expiresAt > Date.now() / 1000)
				// The session helper suppresses 401/403/404. Use the explicit-token SDK call
				// so denial cannot be mistaken for revocation; no service-role credential is used.
				revoked = (await locals.supabase.auth.admin.signOut(locals.session!.access_token, 'others'))?.error === null;
		} catch {
			/* Provider exceptions may contain credentials. */
		}
		if (!revoked) {
			auditLog(
				{
					action: 'auth.session_revoke_failed',
					resourceType: 'user',
					resourceId: locals.user!.id,
					severity: 'warning',
					details: {}
				},
				{ userId: locals.user!.id }
			);
			return json(
				{
					ok: false,
					passwordUpdated: true,
					code: 'session_revocation_pending',
					error: 'Your password changed. Finish signing out other sessions to complete this update.'
				},
				{ status: 202 }
			);
		}
		writePasswordCompletion(cookies, { ...receipt, state: 'complete' });
	}
	if (receipt.flow === 'recovery') cookies.delete(getPendingAuthFlowCookieName(), { path: '/' });
	return json({ ok: true });
}

async function authorizeCompletion(locals: App.Locals): Promise<Response | null> {
	const session = locals.session!;
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
		if (session.expires_at! <= Date.now() / 1000)
			return json({ error: 'Your session expired. Sign in again.' }, { status: 401 });
		if (isMfaStepUpRequired(assurance.data)) {
			return json(
				{ code: 'mfa_required', error: 'Verify your authenticator code before changing your password.' },
				{ status: 403 }
			);
		}
	} catch {
		return json({ error: 'Unable to verify authentication status. Please try again.' }, { status: 503 });
	}

	return null;
}

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
	let issuedToken: string | undefined;
	try {
		const result = await proof.auth.signInWithPassword({ email, password });
		const issued = result?.data?.session;
		if (typeof issued?.access_token === 'string' && /^\S+$/.test(issued.access_token))
			issuedToken = issued.access_token;
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
		// An issued proof token requires actual provider acknowledgment too; the
		// session helper would suppress permission/expiry failures. Failed sign-in
		// without a usable issued token only needs best-effort local cleanup.
		const revoked = issuedToken
			? await proof.auth.admin.signOut(issuedToken, 'local')
			: await proof.auth.signOut({ scope: 'local' });
		if (revoked?.error !== null) return 'unavailable';
	} catch {
		return 'unavailable';
	}
	return outcome === 'accepted' && expiresAt <= Date.now() / 1000 ? 'unavailable' : outcome;
}
