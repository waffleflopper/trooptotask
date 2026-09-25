import { getAdminClient } from '$lib/server/supabase';
import type { PasswordCompletionState, PendingAuthFlow } from './contracts';
import type { Cookies } from '@sveltejs/kit';
import { readAuthSessionMarker } from './mfaGate.server';

// The caller supplies hook-verified identity, including limited recovery/invite sessions.
type PasswordCompletionIdentity = {
	user: { id: string } | null;
	session: { access_token: string; expires_at?: number } | null;
	authFlow: PendingAuthFlow;
};
export type PasswordAttempt = {
	id: string;
	state: 'started' | 'pending' | 'complete' | 'failed';
	flow: PendingAuthFlow;
	expiresAt: number;
	acquired: boolean;
};
type Result = PasswordAttempt | 'expired' | 'unavailable' | null;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function passwordAttempt(
	identity: PasswordCompletionIdentity,
	action: 'read' | 'begin' | 'reconcile' | 'complete' | 'restart' = 'read',
	id?: string
): Promise<Result> {
	if (!identity.user || !identity.session) return null;
	try {
		// Claims belong to the token already verified by hook admission.
		const claims = JSON.parse(Buffer.from(identity.session.access_token.split('.')[1], 'base64url').toString());
		if (claims.sub !== identity.user.id || !uuid.test(claims.session_id)) return 'unavailable';
		const result = await getAdminClient().rpc('password_change_attempt', {
			p_actor: identity.user.id,
			p_session: claims.session_id,
			p_action: action,
			p_flow: identity.authFlow ?? null,
			p_expires_at: new Date(identity.session.expires_at! * 1000).toISOString(),
			p_id: id ?? null
		});
		if (result?.error !== null || !result.data || typeof result.data !== 'object') return 'unavailable';
		const value = result.data;
		if (value.state === null) return null;
		if (value.state === 'expired') return 'expired';
		if (
			!['started', 'pending', 'complete', 'failed'].includes(value.state) ||
			!uuid.test(value.id) ||
			![null, 'recovery', 'invite'].includes(value.flow) ||
			typeof value.expiresAt !== 'number' ||
			!Number.isFinite(value.expiresAt) ||
			typeof value.acquired !== 'boolean' ||
			(value.acquired && (action !== 'begin' || value.state !== 'started')) ||
			(id !== undefined && value.id !== id) ||
			(value.flow !== (identity.authFlow ?? null) && !(value.state === 'complete' && !identity.authFlow))
		)
			return 'unavailable';
		return value;
	} catch {
		return 'unavailable';
	}
}
export async function passwordCompletionState(identity: PasswordCompletionIdentity): Promise<PasswordCompletionState> {
	const attempt = await passwordAttempt(identity);
	return typeof attempt === 'object' ? (attempt?.state ?? null) : attempt;
}

/** The reset page is available only to a verified recovery flow or its completed OTP session. */
export async function recoveryPasswordPageState(
	identity: PasswordCompletionIdentity & {
		session: (NonNullable<PasswordCompletionIdentity['session']> & { user: { id: string } }) | null;
	},
	cookies: Pick<Cookies, 'get'>
): Promise<{ hasSession: boolean; passwordCompletion: PasswordCompletionState }> {
	const inactive = { hasSession: false, passwordCompletion: null };
	if (!identity.user || !identity.session || identity.session.user.id !== identity.user.id) return inactive;
	if (identity.authFlow === 'recovery')
		return { hasSession: true, passwordCompletion: await passwordCompletionState(identity) };
	if (identity.authFlow !== null || readAuthSessionMarker(cookies, identity.session, identity.user) !== 'complete')
		return inactive;

	const attempt = await passwordAttempt(identity);
	return attempt && typeof attempt === 'object' && attempt.flow === 'recovery' && attempt.state === 'complete'
		? { hasSession: true, passwordCompletion: 'complete' }
		: inactive;
}
