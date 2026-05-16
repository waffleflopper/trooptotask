import type { SupabaseClient } from '@supabase/supabase-js';
import { ALL_RANKS } from '$lib/types';
import { requireString, sanitizeString, validateEnum } from '$lib/server/validation';

export type UserProfile = {
	userId: string;
	firstName: string;
	lastName: string;
	rank: string;
};

export type UserProfileFormInput = {
	firstName: FormDataEntryValue | null;
	lastName: FormDataEntryValue | null;
	rank: FormDataEntryValue | null;
};

export function parseUserProfileForm(input: UserProfileFormInput): Omit<UserProfile, 'userId'> | { error: string } {
	const firstName = requireString(String(input.firstName ?? ''), 80);
	const lastName = requireString(String(input.lastName ?? ''), 80);
	const rank = validateEnum(sanitizeString(String(input.rank ?? ''), 20), ALL_RANKS);

	if (!firstName) return { error: 'First name is required' };
	if (!lastName) return { error: 'Last name is required' };
	if (!rank) return { error: 'Select a valid rank' };

	return { firstName, lastName, rank };
}

export async function loadUserProfile(supabase: SupabaseClient, userId: string): Promise<UserProfile | null> {
	const { data, error } = await supabase
		.from('user_profiles')
		.select('user_id, first_name, last_name, rank')
		.eq('user_id', userId)
		.maybeSingle();

	if (error) throw new Error(error.message);
	if (!data) return null;

	return {
		userId: String(data.user_id),
		firstName: String(data.first_name ?? ''),
		lastName: String(data.last_name ?? ''),
		rank: String(data.rank ?? '')
	};
}

export async function loadCurrentUserProfile(locals: App.Locals): Promise<UserProfile | null> {
	if (!locals.user) return null;
	return loadUserProfile(locals.supabase, locals.user.id);
}

export async function upsertUserProfile(supabase: SupabaseClient, profile: UserProfile): Promise<void> {
	const { error } = await supabase.from('user_profiles').upsert(
		{
			user_id: profile.userId,
			first_name: profile.firstName,
			last_name: profile.lastName,
			rank: profile.rank
		},
		{ onConflict: 'user_id' }
	);

	if (error) throw new Error(error.message);
}

export async function upsertCurrentUserProfile(
	locals: App.Locals,
	profile: Omit<UserProfile, 'userId'>
): Promise<void> {
	if (!locals.user) throw new Error('Authentication is required');

	await upsertUserProfile(locals.supabase, {
		userId: locals.user.id,
		...profile
	});
}
