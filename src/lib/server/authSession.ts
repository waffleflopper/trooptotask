import type { JwtPayload, User } from '@supabase/auth-js';

export function getSupabaseAuthStorageKey(supabaseUrl: string): string {
	return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
}

export function hasSupabaseAuthCookie(cookieNames: string[], storageKey: string): boolean {
	return cookieNames.some((name) => name === storageKey || name.startsWith(`${storageKey}.`));
}

export function buildTrustedUserFromClaims(claims: JwtPayload, sessionUser?: User | null): User {
	return {
		id: claims.sub,
		app_metadata: (claims.app_metadata ?? sessionUser?.app_metadata ?? {}) as User['app_metadata'],
		user_metadata: (claims.user_metadata ?? sessionUser?.user_metadata ?? {}) as User['user_metadata'],
		aud: Array.isArray(claims.aud) ? (claims.aud[0] ?? 'authenticated') : claims.aud,
		email: claims.email ?? sessionUser?.email,
		phone: claims.phone ?? sessionUser?.phone,
		created_at: sessionUser?.created_at ?? new Date(claims.iat * 1000).toISOString(),
		confirmation_sent_at: sessionUser?.confirmation_sent_at,
		recovery_sent_at: sessionUser?.recovery_sent_at,
		email_change_sent_at: sessionUser?.email_change_sent_at,
		new_email: sessionUser?.new_email,
		new_phone: sessionUser?.new_phone,
		invited_at: sessionUser?.invited_at,
		action_link: sessionUser?.action_link,
		confirmed_at: sessionUser?.confirmed_at,
		email_confirmed_at: sessionUser?.email_confirmed_at,
		phone_confirmed_at: sessionUser?.phone_confirmed_at,
		// Best-effort until we replace the current absolute-timeout source.
		last_sign_in_at: sessionUser?.last_sign_in_at,
		role: claims.role ?? sessionUser?.role,
		updated_at: sessionUser?.updated_at,
		identities: sessionUser?.identities,
		is_anonymous: claims.is_anonymous ?? sessionUser?.is_anonymous,
		is_sso_user: sessionUser?.is_sso_user,
		factors: sessionUser?.factors,
		deleted_at: sessionUser?.deleted_at,
		banned_until: sessionUser?.banned_until
	};
}
