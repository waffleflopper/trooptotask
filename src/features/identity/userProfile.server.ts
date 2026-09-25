import type { SupabaseClient } from '@supabase/supabase-js';
import { ALL_RANKS } from '$lib/types';
import { requireString, sanitizeString, validateEnum } from '$lib/server/validation';

import type { UserProfile } from './contracts';

type UserProfileFormInput = { firstName: unknown; lastName: unknown; rank: unknown };

export function parseUserProfileForm(input: UserProfileFormInput): Omit<UserProfile, 'userId'> | { error: string } {
	const firstName = requireString(typeof input.firstName === 'string' ? input.firstName : null, 80);
	const lastName = requireString(typeof input.lastName === 'string' ? input.lastName : null, 80);
	const rank = validateEnum(sanitizeString(typeof input.rank === 'string' ? input.rank : null, 20), ALL_RANKS);

	if (!firstName) return { error: 'First name is required' };
	if (!lastName) return { error: 'Last name is required' };
	if (!rank) return { error: 'Select a valid rank' };

	return { firstName, lastName, rank };
}

export async function loadUserProfile(
	{ supabase }: { supabase: SupabaseClient },
	userId: string
): Promise<UserProfile | null> {
	const { data, error } = await supabase
		.from('user_profiles')
		.select('user_id, first_name, last_name, rank')
		.eq('user_id', userId)
		.maybeSingle();

	if (error !== null || data === undefined) throw new Error('Unable to load profile');
	if (data === null) return null;
	if (
		data.user_id !== userId ||
		(data.first_name !== null && typeof data.first_name !== 'string') ||
		(data.last_name !== null && typeof data.last_name !== 'string') ||
		(data.rank !== null && typeof data.rank !== 'string')
	)
		throw new Error('Invalid profile response');

	return {
		userId: String(data.user_id),
		firstName: String(data.first_name ?? ''),
		lastName: String(data.last_name ?? ''),
		rank: String(data.rank ?? '')
	};
}

export async function upsertUserProfile(
	{ supabase }: { supabase: SupabaseClient },
	userId: string,
	profile: Omit<UserProfile, 'userId'>
): Promise<void> {
	const result = await supabase
		.from('user_profiles')
		.upsert(
			{
				user_id: userId,
				first_name: profile.firstName,
				last_name: profile.lastName,
				rank: profile.rank
			},
			{ onConflict: 'user_id' }
		)
		.select('user_id, first_name, last_name, rank')
		.single();

	if (
		result?.error !== null ||
		result.data?.user_id !== userId ||
		result.data?.first_name !== profile.firstName ||
		result.data?.last_name !== profile.lastName ||
		result.data?.rank !== profile.rank
	)
		throw new Error('Unable to confirm profile save');
}
