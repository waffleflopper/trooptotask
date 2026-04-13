import { describe, expect, it } from 'vitest';
import { getSupabaseAuthStorageKey, hasSupabaseAuthCookie } from './authSession';

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
});
