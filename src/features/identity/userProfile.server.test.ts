import { describe, expect, it } from 'vitest';
import { parseUserProfileForm } from './userProfile.server';

describe('parseUserProfileForm', () => {
	it('accepts required profile fields with a controlled-list rank', () => {
		expect(
			parseUserProfileForm({
				firstName: '  Emma ',
				lastName: ' Hayes ',
				rank: 'CPT'
			})
		).toEqual({
			firstName: 'Emma',
			lastName: 'Hayes',
			rank: 'CPT'
		});
	});

	it('rejects free-text ranks', () => {
		expect(
			parseUserProfileForm({
				firstName: 'Emma',
				lastName: 'Hayes',
				rank: 'Commander'
			})
		).toMatchObject({ error: expect.any(String) });
	});
});

describe('profile provider acknowledgment', () => {
	const row = { user_id: 'actor', first_name: 'Jane', last_name: 'Smith', rank: 'SGT' };
	const profile = { userId: 'actor', firstName: 'Jane', lastName: 'Smith', rank: 'SGT' };
	function client(result: unknown) {
		const query = {
			select: () => query,
			eq: () => query,
			maybeSingle: async () => result,
			upsert: () => query,
			single: async () => result
		};
		return { supabase: { from: () => query } as unknown as import('@supabase/supabase-js').SupabaseClient };
	}
	it.each([
		undefined,
		null,
		{},
		{ data: row },
		{ data: row, error: { message: 'private' } },
		{ data: { ...row, user_id: 'other' }, error: null },
		{ data: { ...row, first_name: 12 }, error: null }
	])('rejects unavailable or unbound profile reads and writes: %j', async (result) => {
		const { loadUserProfile, upsertUserProfile } = await import('./userProfile.server');
		await expect(loadUserProfile(client(result), 'actor')).rejects.toThrow();
		await expect(upsertUserProfile(client(result), 'actor', profile)).rejects.toThrow();
	});
	it('distinguishes confirmed absence from a confirmed profile and write', async () => {
		const { loadUserProfile, upsertUserProfile } = await import('./userProfile.server');
		await expect(loadUserProfile(client({ data: null, error: null }), 'actor')).resolves.toBeNull();
		await expect(loadUserProfile(client({ data: row, error: null }), 'actor')).resolves.toEqual(profile);
		await expect(
			loadUserProfile(client({ data: { ...row, first_name: null, last_name: null, rank: null }, error: null }), 'actor')
		).resolves.toEqual({ userId: 'actor', firstName: '', lastName: '', rank: '' });
		await expect(upsertUserProfile(client({ data: row, error: null }), 'actor', profile)).resolves.toBeUndefined();
	});
});
