import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdmittedActor } from './contracts';

type MfaManagementContext = { supabase: SupabaseClient; actor: AdmittedActor | null };

// Management requires complete hook admission. Pending MFA/recovery/invite
// sessions may complete their flow but may not change account factors.
export async function enrollIdentityMfa({
	supabase,
	actor
}: MfaManagementContext): Promise<
	{ status: 'ready'; factorId: string; qrCode: string } | { status: 'denied' | 'unavailable' | 'unauthorized' }
> {
	if (!actor?.userId) return { status: 'unauthorized' };
	try {
		const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
		if (error) {
			return { status: 'denied' };
		}
		if (
			!data ||
			data.type !== 'totp' ||
			typeof data.id !== 'string' ||
			!data.id.trim() ||
			typeof data.totp?.qr_code !== 'string' ||
			!data.totp.qr_code.trim()
		) {
			return { status: 'unavailable' };
		}
		return { status: 'ready', factorId: data.id, qrCode: data.totp.qr_code };
	} catch {
		return { status: 'unavailable' };
	}
}

export async function verifyIdentityMfaEnrollment(
	{ supabase, actor }: MfaManagementContext,
	factorId: unknown,
	code: unknown
): Promise<'verified' | 'invalid' | 'no-factor' | 'factors-unavailable' | 'denied' | 'unavailable' | 'unauthorized'> {
	if (!actor?.userId) return 'unauthorized';
	if (typeof factorId !== 'string' || !factorId.trim() || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
		return 'invalid';
	}

	try {
		const { data: factors, error: lookupError } = await supabase.auth.mfa.listFactors();
		if (lookupError || !factors) {
			return 'factors-unavailable';
		}
		// Pending factors appear in all; the typed lists contain only verified factors.
		const pendingFactor = factors.all.find(
			(factor) => factor.id === factorId && factor.factor_type === 'totp' && factor.status === 'unverified'
		);
		if (!pendingFactor) {
			return 'no-factor';
		}
		const { data, error } = await supabase.auth.mfa.challengeAndVerify({ factorId: pendingFactor.id, code });
		if (error) {
			return 'denied';
		}
		if (
			typeof data?.access_token !== 'string' ||
			!data.access_token.trim() ||
			typeof data?.refresh_token !== 'string' ||
			!data.refresh_token.trim()
		) {
			return 'unavailable';
		}
		return 'verified';
	} catch {
		return 'unavailable';
	}
}

export async function cancelIdentityMfaEnrollment(
	{ supabase, actor }: MfaManagementContext,
	factorId: unknown
): Promise<'cancelled' | 'invalid' | 'no-factor' | 'factors-unavailable' | 'denied' | 'unavailable' | 'unauthorized'> {
	if (!actor?.userId) return 'unauthorized';
	if (typeof factorId !== 'string' || !factorId.trim()) {
		return 'invalid';
	}

	try {
		const { data, error: lookupError } = await supabase.auth.mfa.listFactors();
		if (lookupError || !data) {
			return 'factors-unavailable';
		}

		// The typed factor lists contain only verified factors; pending factors are in all.
		const pendingFactor = data.all.find(
			(factor) => factor.id === factorId && factor.factor_type === 'totp' && factor.status === 'unverified'
		);
		if (!pendingFactor) {
			return 'no-factor';
		}

		const { data: removed, error } = await supabase.auth.mfa.unenroll({ factorId: pendingFactor.id });
		if (error) {
			return 'denied';
		}
		if (removed?.id !== pendingFactor.id) return 'unavailable';
		return 'cancelled';
	} catch {
		return 'unavailable';
	}
}

export async function disableIdentityMfa(
	{ supabase, actor }: MfaManagementContext,
	code: unknown
): Promise<
	| 'disabled'
	| 'invalid'
	| 'no-factor'
	| 'factors-unavailable'
	| 'challenge-denied'
	| 'challenge-unavailable'
	| 'removal-denied'
	| 'removal-unconfirmed'
	| 'unavailable'
	| 'unauthorized'
> {
	if (!actor?.userId) return 'unauthorized';
	if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
		return 'invalid';
	}

	try {
		const { data: factors, error: lookupError } = await supabase.auth.mfa.listFactors();
		if (lookupError || !factors) {
			return 'factors-unavailable';
		}
		const verifiedFactor = factors.all.find(
			(factor) =>
				factor.factor_type === 'totp' &&
				factor.status === 'verified' &&
				typeof factor.id === 'string' &&
				factor.id.trim()
		);
		if (!verifiedFactor) {
			return 'no-factor';
		}

		const { data: challenge, error: challengeError } = await supabase.auth.mfa.challengeAndVerify({
			factorId: verifiedFactor.id,
			code
		});
		if (challengeError) {
			return 'challenge-denied';
		}
		if (
			typeof challenge?.access_token !== 'string' ||
			!challenge.access_token.trim() ||
			typeof challenge?.refresh_token !== 'string' ||
			!challenge.refresh_token.trim()
		) {
			return 'challenge-unavailable';
		}

		const { data: removed, error } = await supabase.auth.mfa.unenroll({ factorId: verifiedFactor.id });
		if (error) {
			return 'removal-denied';
		}
		if (removed?.id !== verifiedFactor.id) {
			return 'removal-unconfirmed';
		}
		return 'disabled';
	} catch {
		return 'unavailable';
	}
}
