import type { EmailOtpType } from '@supabase/supabase-js';

const authConfirmDestinations = {
	invite: '/auth/accept-invite',
	recovery: '/auth/reset-password'
} as const;

export type SupportedAuthConfirmType = Extract<EmailOtpType, keyof typeof authConfirmDestinations>;

export type AuthConfirmState =
	| {
			status: 'valid';
			tokenHash: string;
			type: SupportedAuthConfirmType;
			next: (typeof authConfirmDestinations)[SupportedAuthConfirmType];
	  }
	| {
			status: 'invalid';
	  };

export function getAuthConfirmState(
	input:
		| URLSearchParams
		| {
				tokenHash?: string | null | undefined;
				type?: string | null | undefined;
				next?: string | null | undefined;
		  }
): AuthConfirmState {
	const tokenHash = normalizeAuthConfirmValue(
		input instanceof URLSearchParams ? input.get('token_hash') : input.tokenHash
	);
	const type = normalizeSupportedAuthConfirmType(input instanceof URLSearchParams ? input.get('type') : input.type);
	const next = normalizeAuthConfirmValue(input instanceof URLSearchParams ? input.get('next') : input.next);

	if (!tokenHash || !type || !next || authConfirmDestinations[type] !== next) {
		return { status: 'invalid' };
	}

	return {
		status: 'valid',
		tokenHash,
		type,
		next: authConfirmDestinations[type]
	};
}

export function getAuthConfirmRedirectTo(origin: string, type: SupportedAuthConfirmType): string {
	const confirmUrl = new URL('/auth/confirm', origin);
	confirmUrl.searchParams.set('type', type);
	confirmUrl.searchParams.set('next', authConfirmDestinations[type]);
	return confirmUrl.toString();
}

function normalizeAuthConfirmValue(value: string | null | undefined): string | null {
	const normalized = value?.trim();
	return normalized ? normalized : null;
}

function normalizeSupportedAuthConfirmType(value: string | null | undefined): SupportedAuthConfirmType | null {
	return value === 'invite' || value === 'recovery' ? value : null;
}
