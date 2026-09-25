import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { checkDurableRateLimit } from '$lib/access/index.server';
import { validateEmail } from '$lib/server/validation';
import type { AccountSecurityOverview, AdmittedActor } from './contracts';
import { verifyPasswordProof } from './passwordProof.server';
import { checkSessionAssurance } from './sessionAssurance.server';

type SecurityContext = { supabase: SupabaseClient; actor: AdmittedActor | null; user: User | null };

function getPendingEmail(user: User): string | null {
	const rawUser = user as unknown as Record<string, unknown>;
	const value = rawUser.new_email ?? rawUser.email_change ?? rawUser.email_change_sent_to;
	return typeof value === 'string' && value ? value : null;
}

export async function readIdentitySecurity({
	supabase,
	actor,
	user
}: SecurityContext): Promise<AccountSecurityOverview | null> {
	if (!actor?.userId || user?.id !== actor.userId) return null;
	let hasMFA: boolean | null = null;
	try {
		const result = await supabase.auth.mfa.listFactors();
		const totp = result?.data?.totp;
		if (
			result?.error === null &&
			Array.isArray(totp) &&
			totp.every((factor) => factor && (factor.status === 'verified' || factor.status === 'unverified'))
		)
			hasMFA = totp.some((factor) => factor.status === 'verified');
	} catch {
		// Unknown provider state must not be presented as disabled MFA.
	}
	return { hasMFA, currentEmail: user.email ?? '', pendingEmail: getPendingEmail(user) };
}

type EmailUpdateResult =
	| { status: 'accepted'; email: string }
	| { status: 'inactive' }
	| { status: 'limited'; email: string; retryAfterSeconds: number }
	| {
			status:
				| 'invalid-email'
				| 'same-email'
				| 'missing-password'
				| 'limit-unavailable'
				| 'incorrect-password'
				| 'proof-unavailable'
				| 'assurance-unavailable'
				| 'mfa-required'
				| 'unconfirmed';
			email: string;
	  };

export async function updateIdentityEmail(
	{ supabase, actor, user, session }: SecurityContext & { session: Session | null },
	input: {
		email: string | null;
		emailCount: number;
		currentPassword: string | null;
		passwordCount: number;
		clientAddress: string;
	}
): Promise<EmailUpdateResult> {
	if (
		!actor?.userId ||
		user?.id !== actor.userId ||
		typeof user.email !== 'string' ||
		!user.email ||
		session?.user?.id !== user.id ||
		typeof session.access_token !== 'string' ||
		!/^\S+$/.test(session.access_token) ||
		typeof session.expires_at !== 'number' ||
		!Number.isFinite(session.expires_at) ||
		session.expires_at <= Date.now() / 1000
	)
		return { status: 'inactive' };
	const email = input.email?.trim().toLowerCase() ?? '';
	if (input.emailCount !== 1 || !validateEmail(email)) return { status: 'invalid-email', email };
	if (email === user.email.toLowerCase()) return { status: 'same-email', email };
	const currentPassword = input.currentPassword;
	if (input.passwordCount !== 1 || !currentPassword) return { status: 'missing-password', email };
	if (session.expires_at <= Date.now() / 1000) return { status: 'inactive' };
	try {
		const limit = await checkDurableRateLimit({
			namespace: 'email-change',
			dimensions: [
				{ name: 'user', value: user.id },
				{ name: 'ip', value: input.clientAddress }
			],
			windowMs: 15 * 60 * 1000,
			maxRequests: 5
		});
		if (limit.limited)
			return { status: 'limited', email, retryAfterSeconds: Math.max(1, Math.ceil(limit.retryAfterMs / 1000)) };
	} catch {
		return { status: 'limit-unavailable', email };
	}
	if (session.expires_at <= Date.now() / 1000) return { status: 'inactive' };
	const proof = await verifyPasswordProof(user.id, user.email, currentPassword).catch(() => 'unavailable' as const);
	if (proof === 'incorrect') return { status: 'incorrect-password', email };
	if (proof !== 'accepted') return { status: 'proof-unavailable', email };
	if (session.expires_at <= Date.now() / 1000) return { status: 'inactive' };
	const assurance = await checkSessionAssurance(supabase, session);
	if (assurance === 'unavailable') return { status: 'assurance-unavailable', email };
	if (assurance === 'expired') return { status: 'inactive' };
	if (assurance === 'mfa_required') return { status: 'mfa-required', email };
	// A lost response does not prove rollback. Reload recovers the provider's pending address.
	try {
		const result = await supabase.auth.updateUser({ email });
		if (
			result?.error !== null ||
			result.data?.user?.id !== user.id ||
			getPendingEmail(result.data.user) !== email ||
			result.data.user.email?.toLowerCase() !== user.email.toLowerCase()
		)
			return { status: 'unconfirmed', email };
	} catch {
		return { status: 'unconfirmed', email };
	}
	return { status: 'accepted', email };
}
