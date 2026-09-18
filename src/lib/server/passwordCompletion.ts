import { getAdminClient } from '$lib/server/supabase';
import type { PasswordCompletionState } from '$lib/auth/passwordCompletion';

type Identity = Pick<App.Locals, 'user' | 'session' | 'authFlow'>;
export type PasswordAttempt = {
	id: string;
	state: 'started' | 'pending' | 'complete' | 'failed';
	flow: 'recovery' | 'invite' | null;
	expiresAt: number;
	acquired: boolean;
};
type Result = PasswordAttempt | 'expired' | 'unavailable' | null;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function passwordAttempt(
	locals: Identity,
	action: 'read' | 'begin' | 'reconcile' | 'complete' | 'restart' = 'read',
	id?: string
): Promise<Result> {
	if (!locals.user || !locals.session) return null;
	try {
		// Claims belong to the token already verified by hook admission.
		const claims = JSON.parse(Buffer.from(locals.session.access_token.split('.')[1], 'base64url').toString());
		if (claims.sub !== locals.user.id || !uuid.test(claims.session_id)) return 'unavailable';
		const result = await getAdminClient().rpc('password_change_attempt', {
			p_actor: locals.user.id,
			p_session: claims.session_id,
			p_action: action,
			p_flow: locals.authFlow ?? null,
			p_expires_at: new Date(locals.session.expires_at! * 1000).toISOString(),
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
			(value.flow !== (locals.authFlow ?? null) && !(value.state === 'complete' && !locals.authFlow))
		)
			return 'unavailable';
		return value;
	} catch {
		return 'unavailable';
	}
}
export async function passwordCompletionState(locals: Identity): Promise<PasswordCompletionState> {
	const attempt = await passwordAttempt(locals);
	return typeof attempt === 'object' ? (attempt?.state ?? null) : attempt;
}
