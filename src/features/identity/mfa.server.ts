import type { SupabaseClient } from '@supabase/supabase-js';
import type { MfaStatus } from './contracts';

// Completion operations accept the hook-verified request client even while MFA
// is pending; they never mint an actor or expose the provider's credentials.
export async function readIdentityMfaStatus({
	supabase
}: {
	supabase: SupabaseClient;
}): Promise<{ status: 'ready'; assurance: MfaStatus } | { status: 'denied' | 'unavailable' }> {
	try {
		const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
		if (error) return { status: 'denied' };
		if (
			!data ||
			(data.currentLevel !== 'aal1' && data.currentLevel !== 'aal2') ||
			(data.nextLevel !== 'aal1' && data.nextLevel !== 'aal2')
		) {
			return { status: 'unavailable' };
		}
		return {
			status: 'ready',
			assurance: {
				currentLevel: data.currentLevel === 'aal1' ? 'aal1' : 'aal2',
				nextLevel: data.nextLevel === 'aal1' ? 'aal1' : 'aal2'
			}
		};
	} catch {
		return { status: 'unavailable' };
	}
}

export async function verifyIdentityMfa(
	{ supabase }: { supabase: SupabaseClient },
	code: unknown
): Promise<'verified' | 'invalid' | 'no-factor' | 'factors-unavailable' | 'denied' | 'unconfirmed' | 'unavailable'> {
	if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return 'invalid';
	try {
		const { data: factors, error: lookupError } = await supabase.auth.mfa.listFactors();
		if (lookupError || !factors) return 'factors-unavailable';
		const verifiedFactor = factors.all.find(
			(factor) =>
				factor.factor_type === 'totp' &&
				factor.status === 'verified' &&
				typeof factor.id === 'string' &&
				factor.id.trim()
		);
		if (!verifiedFactor) return 'no-factor';

		const { data: challenge, error: challengeError } = await supabase.auth.mfa.challengeAndVerify({
			factorId: verifiedFactor.id,
			code
		});
		if (challengeError) return 'denied';
		if (
			typeof challenge?.access_token !== 'string' ||
			!challenge.access_token.trim() ||
			typeof challenge?.refresh_token !== 'string' ||
			!challenge.refresh_token.trim()
		) {
			return 'unconfirmed';
		}
		return 'verified';
	} catch {
		return 'unavailable';
	}
}
