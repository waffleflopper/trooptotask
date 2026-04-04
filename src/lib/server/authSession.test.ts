import { describe, expect, it } from 'vitest';
import { buildTrustedUserFromClaims, getSupabaseAuthStorageKey, hasSupabaseAuthCookie } from './authSession';

describe('authSession helpers', () => {
	it('derives the default Supabase SSR auth cookie storage key from the project URL', () => {
		expect(getSupabaseAuthStorageKey('https://abcd1234.supabase.co')).toBe('sb-abcd1234-auth-token');
		expect(getSupabaseAuthStorageKey('http://127.0.0.1:54321')).toBe('sb-127-auth-token');
	});

	it('detects chunked or unchunked Supabase auth cookies', () => {
		const storageKey = 'sb-abcd1234-auth-token';

		expect(hasSupabaseAuthCookie([], storageKey)).toBe(false);
		expect(hasSupabaseAuthCookie(['sb-other-auth-token'], storageKey)).toBe(false);
		expect(hasSupabaseAuthCookie([storageKey], storageKey)).toBe(true);
		expect(hasSupabaseAuthCookie([`${storageKey}.0`, `${storageKey}.1`], storageKey)).toBe(true);
	});

	it('builds the trusted request user shape from verified claims while preserving needed session metadata', () => {
		const user = buildTrustedUserFromClaims(
			{
				iss: 'https://abcd1234.supabase.co/auth/v1',
				sub: 'user-123',
				aud: 'authenticated',
				exp: 1_900_000_000,
				iat: 1_800_000_000,
				role: 'authenticated',
				aal: 'aal1',
				session_id: 'session-123',
				email: 'person@example.com',
				app_metadata: { provider: 'email' },
				user_metadata: { full_name: 'Person Example' }
			},
			{
				id: 'stale-id',
				aud: 'authenticated',
				app_metadata: {},
				user_metadata: {},
				created_at: '2026-01-01T00:00:00.000Z',
				last_sign_in_at: '2026-04-04T00:00:00.000Z',
				factors: [
					{
						id: 'factor-1',
						factor_type: 'totp',
						status: 'verified',
						created_at: '2026-04-04T00:00:00.000Z',
						updated_at: '2026-04-04T00:00:00.000Z'
					}
				]
			}
		);

		expect(user.id).toBe('user-123');
		expect(user.email).toBe('person@example.com');
		expect(user.created_at).toBe('2026-01-01T00:00:00.000Z');
		expect(user.last_sign_in_at).toBe('2026-04-04T00:00:00.000Z');
		expect(user.factors).toEqual([
			{
				id: 'factor-1',
				factor_type: 'totp',
				status: 'verified',
				created_at: '2026-04-04T00:00:00.000Z',
				updated_at: '2026-04-04T00:00:00.000Z'
			}
		]);
		expect(user.app_metadata).toEqual({ provider: 'email' });
		expect(user.user_metadata).toEqual({ full_name: 'Person Example' });
	});
});
