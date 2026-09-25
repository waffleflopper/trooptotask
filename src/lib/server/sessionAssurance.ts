import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { isMfaStepUpRequired } from '$features/identity/index.server';

type SessionAssurance = 'allowed' | 'mfa_required' | 'expired' | 'unavailable';

/** Read fresh assurance for an already identity-verified session before auth effects. */
export async function checkSessionAssurance(
	supabase: SupabaseClient,
	session: Pick<Session, 'access_token' | 'expires_at'>
): Promise<SessionAssurance> {
	try {
		const result = await supabase.auth.mfa.getAuthenticatorAssuranceLevel(session.access_token);
		if (
			result?.error !== null ||
			!['aal1', 'aal2'].includes(result.data?.currentLevel ?? '') ||
			!['aal1', 'aal2'].includes(result.data?.nextLevel ?? '')
		)
			return 'unavailable';
		if (
			typeof session.expires_at !== 'number' ||
			!Number.isFinite(session.expires_at) ||
			session.expires_at <= Date.now() / 1000
		)
			return 'expired';
		return isMfaStepUpRequired(result.data) ? 'mfa_required' : 'allowed';
	} catch {
		// Provider exceptions may contain credentials; return only an admission outcome.
		return 'unavailable';
	}
}
