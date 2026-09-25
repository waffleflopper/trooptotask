import type { SupabaseClient } from '@supabase/supabase-js';
import { mapProviderPasswordError, validatePassword } from '$lib/server/validation';
import type { PasswordCompletionState, PendingAuthFlow } from './contracts';
import { passwordAttempt, type PasswordAttempt } from './passwordCompletion.server';
import { checkSessionAssurance } from './sessionAssurance.server';
import { verifyPasswordProof } from './passwordProof.server';
import { checkPasswordUpdateRateLimit } from './passwordUpdateRateLimit.server';
import { durableRateLimitAuditDetails } from '$lib/access/index.server';

type PasswordUpdateIdentity = {
	supabase: SupabaseClient;
	user: { id: string; email?: string } | null;
	session: { user: { id: string }; access_token: string; expires_at?: number } | null;
	authFlow: PendingAuthFlow;
};

type PasswordUpdateResult =
	| {
			status:
				| 'inactive'
				| 'invalid-input'
				| 'invalid-action'
				| 'password-required'
				| 'current-password-required'
				| 'password-mismatch'
				| 'email-unavailable'
				| 'incorrect-password'
				| 'proof-unavailable'
				| 'assurance-unavailable'
				| 'expired'
				| 'mfa-required';
	  }
	| { status: 'invalid-password'; error: string }
	| { status: 'reconciliation'; state: PasswordCompletionState; error: string | null }
	| { status: 'revocation-pending'; userId: string }
	| {
			status: 'limited';
			retryAfterSeconds: number;
			userId: string;
			userEmail: string | null;
			ip: string;
			auditDetails: Record<string, unknown>;
	  }
	| { status: 'complete'; clearRecoveryFlow: boolean };

export async function updateIdentityPassword(
	locals: PasswordUpdateIdentity,
	readInput: () => Promise<Record<string, unknown> | null>,
	getClientAddress: () => string
): Promise<PasswordUpdateResult> {
	const { user, session } = locals;
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
		return { status: 'inactive' };
	}
	const userId = user.id;
	const userEmail = typeof user.email === 'string' ? user.email : null;
	const input = await readInput();
	if (!input) return { status: 'invalid-input' };
	const { currentPassword, password, confirmPassword, action } = input;
	const attempt = await passwordAttempt(locals);
	if ((attempt === 'expired' && action !== 'restart') || attempt === 'unavailable')
		return reconciliationResult(attempt);
	if (attempt || action !== undefined) {
		const limited = await checkPasswordLimit({ getClientAddress, userId, userEmail });
		if (limited) return limited;
		const denied = await authorizeCompletion(locals);
		if (denied) return denied;
		if (action === 'restart') {
			const restarted = await passwordAttempt(locals, 'restart');
			return restarted === null ? { status: 'complete', clearRecoveryFlow: false } : reconciliationResult(restarted);
		}
		if (action !== undefined && action !== 'complete') return { status: 'invalid-action' };
		if (!attempt || typeof attempt === 'string') return reconciliationResult(attempt);
		if (attempt.expiresAt <= Date.now() / 1000) return reconciliationResult('expired');
		const reconciled =
			attempt.state === 'started' && action === 'complete'
				? await passwordAttempt(locals, 'reconcile', attempt.id)
				: attempt;
		if (!reconciled || typeof reconciled === 'string' || !['pending', 'complete'].includes(reconciled.state))
			return reconciliationResult(reconciled);
		return finishPasswordCompletion(locals, reconciled);
	}
	if (typeof password !== 'string') {
		return { status: 'password-required' };
	}
	const passwordError = validatePassword(password);
	if (passwordError) {
		return { status: 'invalid-password', error: passwordError };
	}
	if (session.expires_at <= Date.now() / 1000) return { status: 'inactive' };

	const isRecoveryOrInviteFlow = locals.authFlow === 'recovery' || locals.authFlow === 'invite';

	if (!isRecoveryOrInviteFlow) {
		if (typeof currentPassword !== 'string' || !currentPassword) {
			return { status: 'current-password-required' };
		}

		if (typeof confirmPassword !== 'string' || password !== confirmPassword) {
			return { status: 'password-mismatch' };
		}

		const email = userEmail;
		if (!email) {
			return { status: 'email-unavailable' };
		}

		const limitedResponse = await checkPasswordLimit({
			getClientAddress,
			userId,
			userEmail: email
		});
		if (limitedResponse) {
			return limitedResponse;
		}
		if (session.expires_at <= Date.now() / 1000) return { status: 'inactive' };

		const proof = await verifyPasswordProof(userId, email, currentPassword).catch(() => 'unavailable' as const);
		if (proof === 'incorrect') {
			return { status: 'incorrect-password' };
		}
		if (proof !== 'accepted') {
			return { status: 'proof-unavailable' };
		}
		if (session.expires_at <= Date.now() / 1000) return { status: 'inactive' };
	} else {
		const limitedResponse = await checkPasswordLimit({
			getClientAddress,
			userId,
			userEmail
		});
		if (limitedResponse) {
			return limitedResponse;
		}
		if (session.expires_at <= Date.now() / 1000) return { status: 'inactive' };
	}

	const denied = await authorizeCompletion(locals);
	if (denied) return denied;
	const admitted = await passwordAttempt(locals, 'begin');
	if (!admitted || typeof admitted === 'string' || !admitted.acquired) return reconciliationResult(admitted);
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
		return reconciliationResult(reconciled, providerError);
	return finishPasswordCompletion(locals, reconciled);
}

async function finishPasswordCompletion(
	locals: PasswordUpdateIdentity,
	attempt: PasswordAttempt
): Promise<PasswordUpdateResult> {
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
			return { status: 'revocation-pending', userId: locals.user!.id };
		}
		const completed = await passwordAttempt(locals, 'complete', attempt.id);
		if (!completed || typeof completed === 'string' || completed.state !== 'complete')
			return reconciliationResult(completed);
	}
	return { status: 'complete', clearRecoveryFlow: attempt.flow === 'recovery' };
}

function reconciliationResult(
	attempt: Awaited<ReturnType<typeof passwordAttempt>>,
	error: string | null = null
): PasswordUpdateResult {
	const state = typeof attempt === 'object' ? attempt?.state : attempt;
	return { status: 'reconciliation', state: state ?? null, error };
}

async function authorizeCompletion(locals: PasswordUpdateIdentity): Promise<PasswordUpdateResult | null> {
	// Password proof uses its own AAL1 token; check the original admitted session.
	const assurance = await checkSessionAssurance(locals.supabase, locals.session!);
	if (assurance === 'unavailable') return { status: 'assurance-unavailable' };
	if (assurance === 'expired') return { status: 'expired' };
	if (assurance === 'mfa_required') return { status: 'mfa-required' };
	return null;
}

async function checkPasswordLimit(input: {
	getClientAddress: () => string;
	userId: string;
	userEmail: string | null;
}): Promise<PasswordUpdateResult | null> {
	const ip = input.getClientAddress();
	const rateLimit = await checkPasswordUpdateRateLimit({ userId: input.userId, ip });
	if (!rateLimit.limited) return null;
	return {
		status: 'limited',
		retryAfterSeconds: Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000)),
		userId: input.userId,
		userEmail: input.userEmail,
		ip,
		auditDetails: durableRateLimitAuditDetails(rateLimit)
	};
}
