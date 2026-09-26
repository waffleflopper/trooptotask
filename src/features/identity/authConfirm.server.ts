import type { EmailOtpType } from '@supabase/supabase-js';
import { makePublicAppUrl } from '$lib/server/publicAppOrigin';

const authConfirmDestinations = {
	email: ['/org/new', '/dashboard'],
	invite: ['/auth/accept-invite'],
	recovery: ['/auth/reset-password'],
	signup: ['/org/new', '/dashboard']
} as const;

export type SupportedAuthConfirmType = Extract<EmailOtpType, keyof typeof authConfirmDestinations>;
type AuthConfirmDestination = (typeof authConfirmDestinations)[SupportedAuthConfirmType][number];

export type AuthConfirmState =
	| {
			status: 'valid';
			tokenHash: string;
			type: SupportedAuthConfirmType;
			next: AuthConfirmDestination;
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

	if (!tokenHash || !type || !next || !isSupportedAuthConfirmDestination(type, next)) {
		return { status: 'invalid' };
	}

	return {
		status: 'valid',
		tokenHash,
		type,
		next
	};
}

export function getAuthConfirmRedirectTo(
	inboundOrigin: string,
	type: SupportedAuthConfirmType,
	next: AuthConfirmDestination = getDefaultAuthConfirmDestination(type)
): string {
	if (!isSupportedAuthConfirmDestination(type, next)) {
		throw new Error('Unsupported auth confirmation destination');
	}

	const confirmUrl = new URL(makePublicAppUrl('/auth/confirm', { inboundOrigin }));
	confirmUrl.searchParams.set('type', type);
	confirmUrl.searchParams.set('next', next);
	return confirmUrl.toString();
}

function normalizeAuthConfirmValue(value: string | null | undefined): string | null {
	const normalized = value?.trim();
	return normalized ? normalized : null;
}

function normalizeSupportedAuthConfirmType(value: string | null | undefined): SupportedAuthConfirmType | null {
	return value === 'email' || value === 'invite' || value === 'recovery' || value === 'signup' ? value : null;
}

function getDefaultAuthConfirmDestination(type: SupportedAuthConfirmType): AuthConfirmDestination {
	return authConfirmDestinations[type][0];
}

function isSupportedAuthConfirmDestination(
	type: SupportedAuthConfirmType,
	next: string
): next is AuthConfirmDestination {
	return (authConfirmDestinations[type] as readonly string[]).includes(next);
}
