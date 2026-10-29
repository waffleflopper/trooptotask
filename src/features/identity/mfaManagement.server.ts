import type { SupabaseClient } from '$lib/server/database';
import type { AdmittedActor } from './contracts';
import { admitMfaCodeAttempt, type MfaCodeAdmission } from './mfaCodeRateLimit.server';

type MfaManagementContext = { supabase: SupabaseClient; actor: AdmittedActor | null };

// Management requires complete hook admission. Pending MFA/recovery/invite
// sessions may complete their flow but may not change account factors.
export async function enrollIdentityMfa({
	supabase,
	actor
}: MfaManagementContext): Promise<
	| { status: 'ready'; factorId: string; qrCode: string; secret: string }
	| { status: 'enabled' | 'denied' | 'unavailable' | 'unauthorized' }
> {
	if (!actor?.userId) return { status: 'unauthorized' };
	try {
		const { data: factors, error: lookupError } = await supabase.auth.mfa.listFactors();
		if (lookupError || !factors) return { status: 'unavailable' };
		const totpFactors = factors.all.filter((factor) => factor.factor_type === 'totp');
		if (totpFactors.some((factor) => factor.status === 'verified')) return { status: 'enabled' };
		// A setup page that was left or reloaded leaves its unverified factor behind; starting again replaces it.
		for (const abandoned of totpFactors) {
			const { error } = await supabase.auth.mfa.unenroll({ factorId: abandoned.id });
			if (error) return { status: 'unavailable' };
		}

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
			!data.totp.qr_code.trim() ||
			typeof data.totp.secret !== 'string' ||
			!data.totp.secret.trim()
		) {
			return { status: 'unavailable' };
		}
		return { status: 'ready', factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
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
	| {
			status:
				| 'disabled'
				| 'invalid'
				| 'no-factor'
				| 'factors-unavailable'
				| 'challenge-denied'
				| 'challenge-unavailable'
				| 'removal-denied'
				| 'removal-unconfirmed'
				| 'unavailable'
				| 'unauthorized';
	  }
	| Exclude<MfaCodeAdmission, { status: 'admitted' }>
> {
	if (!actor?.userId) return { status: 'unauthorized' };
	if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
		return { status: 'invalid' };
	}
	const admission = await admitMfaCodeAttempt(actor.userId);
	if (admission.status !== 'admitted') return admission;

	try {
		const { data: factors, error: lookupError } = await supabase.auth.mfa.listFactors();
		if (lookupError || !factors) {
			return { status: 'factors-unavailable' };
		}
		const verifiedFactor = factors.all.find(
			(factor) =>
				factor.factor_type === 'totp' &&
				factor.status === 'verified' &&
				typeof factor.id === 'string' &&
				factor.id.trim()
		);
		if (!verifiedFactor) {
			return { status: 'no-factor' };
		}

		const { data: challenge, error: challengeError } = await supabase.auth.mfa.challengeAndVerify({
			factorId: verifiedFactor.id,
			code
		});
		if (challengeError) {
			return { status: 'challenge-denied' };
		}
		if (
			typeof challenge?.access_token !== 'string' ||
			!challenge.access_token.trim() ||
			typeof challenge?.refresh_token !== 'string' ||
			!challenge.refresh_token.trim()
		) {
			return { status: 'challenge-unavailable' };
		}

		const { data: removed, error } = await supabase.auth.mfa.unenroll({ factorId: verifiedFactor.id });
		if (error) {
			return { status: 'removal-denied' };
		}
		if (removed?.id !== verifiedFactor.id) {
			return { status: 'removal-unconfirmed' };
		}
		return { status: 'disabled' };
	} catch {
		return { status: 'unavailable' };
	}
}
