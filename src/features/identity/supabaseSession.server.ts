import type { Cookies } from '@sveltejs/kit';
import type { JwtPayload, User } from '@supabase/auth-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const sessionStartTimestamp = z.iso.datetime({ offset: true });

export async function readSessionLifetime(
	supabase: SupabaseClient,
	accessToken: string
): Promise<'active' | 'expired' | 'unavailable'> {
	try {
		// The RPC reads only the session identified by this verified bearer token.
		// Token iat/AMR and account last_sign_in_at cannot establish its original age.
		const result = await supabase
			.rpc('get_current_session_started_at')
			.setHeader('Authorization', `Bearer ${accessToken}`);
		if (!result || result.error !== null) return 'unavailable';
		if (result.data === null) return 'expired';
		const parsed = sessionStartTimestamp.safeParse(result.data);
		if (!parsed.success) return 'unavailable';
		const startedAt = Date.parse(parsed.data);
		const now = Date.now();
		if (!Number.isFinite(startedAt) || startedAt > now) return 'unavailable';
		return now - startedAt >= 24 * 60 * 60 * 1000 ? 'expired' : 'active';
	} catch {
		return 'unavailable';
	}
}

export function getSupabaseAuthStorageKey(supabaseUrl: string): string {
	return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
}

export function hasSupabaseAuthCookie(cookieNames: string[], storageKey: string): boolean {
	return cookieNames.some((name) => name === storageKey || name.startsWith(`${storageKey}.`));
}

// Removal is local only; callers must separately establish provider revocation.
export function clearSupabaseAuthCookies(cookies: Cookies, storageKey: string): void {
	for (const { name } of cookies.getAll()) {
		if (
			hasSupabaseAuthCookie([name], storageKey) ||
			hasSupabaseAuthCookie([name], `${storageKey}-code-verifier`) ||
			hasSupabaseAuthCookie([name], `${storageKey}-user`)
		) {
			cookies.delete(name, { path: '/' });
		}
	}
}

export function buildTrustedUserFromClaims(claims: JwtPayload, sessionUser?: User | null): User {
	return {
		id: claims.sub,
		app_metadata: (claims.app_metadata ?? sessionUser?.app_metadata ?? {}) as User['app_metadata'],
		user_metadata: (claims.user_metadata ?? sessionUser?.user_metadata ?? {}) as User['user_metadata'],
		aud: Array.isArray(claims.aud) ? (claims.aud[0] ?? 'authenticated') : claims.aud,
		// The hook verifies this provider user against claims.sub. Email can change
		// before the admitted token expires; never restore its stale email claim.
		email: sessionUser?.id === claims.sub ? sessionUser.email : claims.email,
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
