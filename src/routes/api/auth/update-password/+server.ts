import { checkSessionAssurance } from '$lib/server/sessionAssurance';
import { json } from '@sveltejs/kit';
import { verifyPasswordProof } from '$lib/server/passwordProof';
import type { RequestHandler } from './$types';
import { passwordAttempt, type PasswordAttempt } from '$lib/server/passwordCompletion';
import { auditLog } from '$lib/server/auditLog';
import {
	checkPasswordUpdateRateLimit,
	PASSWORD_UPDATE_RATE_LIMIT_MESSAGE,
	passwordUpdateRateLimitAuditDetails
} from '$lib/server/passwordUpdateRateLimit';
import { mapProviderPasswordError, validatePassword } from '$lib/server/validation';
import { getPendingAuthFlowCookieName } from '$lib/server/mfaGate';

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
	const attempt = await passwordAttempt(locals);
	if ((attempt === 'expired' && action !== 'restart') || attempt === 'unavailable') return attemptResponse(attempt);
	if (attempt || action !== undefined) {
		const limited = await checkAndAuditPasswordUpdateLimit({ request, getClientAddress, userId, userEmail });
		if (limited) return limited;
		const denied = await authorizeCompletion(locals);
		if (denied) return denied;
		if (action === 'restart') {
			const restarted = await passwordAttempt(locals, 'restart');
			return restarted === null ? json({ ok: true }) : attemptResponse(restarted);
		}
		if (action !== undefined && action !== 'complete')
			return json({ error: 'Invalid completion action.' }, { status: 400 });
		if (!attempt || typeof attempt === 'string') return attemptResponse(attempt);
		if (attempt.expiresAt <= Date.now() / 1000) return attemptResponse('expired');
		const reconciled =
			attempt.state === 'started' && action === 'complete'
				? await passwordAttempt(locals, 'reconcile', attempt.id)
				: attempt;
		if (!reconciled || typeof reconciled === 'string' || !['pending', 'complete'].includes(reconciled.state))
			return attemptResponse(reconciled);
		return finishPasswordCompletion(locals, cookies, reconciled);
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
	const admitted = await passwordAttempt(locals, 'begin');
	if (!admitted || typeof admitted === 'string' || !admitted.acquired) return attemptResponse(admitted);
	// The transaction marker is consumed by the database trigger. Confirmation
	// comes from that transaction, never from delivery of the provider response.
	let providerError: string | null = null;
	try {
		const mutation = await locals.supabase.auth.updateUser({ password, data: { ttt_password_attempt: admitted.id } });
		if (mutation?.error) providerError = mapProviderPasswordError(mutation.error);
	} catch {
		/* A transport failure is not evidence of rollback. */
	}
	const reconciled = await passwordAttempt(locals, 'reconcile', admitted.id);
	if (!reconciled || typeof reconciled === 'string' || !['pending', 'complete'].includes(reconciled.state))
		return attemptResponse(reconciled, providerError);
	return finishPasswordCompletion(locals, cookies, reconciled);
};

function attemptResponse(attempt: Awaited<ReturnType<typeof passwordAttempt>>, error?: string | null): Response {
	const state = typeof attempt === 'object' ? attempt?.state : attempt;
	return json(
		{
			ok: false,
			code: 'password_reconciliation_required',
			state: state ?? 'failed',
			error:
				error ??
				(state === 'failed'
					? 'This attempt did not commit. Start a new password update to try again.'
					: 'Check the saved password update before continuing.')
		},
		{ status: state === 'unavailable' ? 503 : 409 }
	);
}

async function finishPasswordCompletion(
	locals: App.Locals,
	cookies: Parameters<RequestHandler>[0]['cookies'],
	attempt: PasswordAttempt
): Promise<Response> {
	if (attempt.state !== 'complete') {
		let revoked = false;
		try {
			if (attempt.expiresAt > Date.now() / 1000)
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
		const completed = await passwordAttempt(locals, 'complete', attempt.id);
		if (!completed || typeof completed === 'string' || completed.state !== 'complete')
			return attemptResponse(completed);
	}
	if (attempt.flow === 'recovery') cookies.delete(getPendingAuthFlowCookieName(), { path: '/' });
	return json({ ok: true });
}

async function authorizeCompletion(locals: App.Locals): Promise<Response | null> {
	// Password proof uses its own AAL1 token; check the original admitted session.
	const assurance = await checkSessionAssurance(locals.supabase, locals.session!);
	if (assurance === 'unavailable')
		return json({ error: 'Unable to verify authentication status. Please try again.' }, { status: 503 });
	if (assurance === 'expired') return json({ error: 'Your session expired. Sign in again.' }, { status: 401 });
	if (assurance === 'mfa_required')
		return json(
			{ code: 'mfa_required', error: 'Verify your authenticator code before changing your password.' },
			{ status: 403 }
		);

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
