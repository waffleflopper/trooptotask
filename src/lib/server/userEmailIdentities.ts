import type { SupabaseClient } from '@supabase/supabase-js';

interface UserEmailIdentityRow {
	user_id: string;
	normalized_email: string;
}

export interface UserEmailIdentity {
	userId: string;
	normalizedEmail: string;
}

export function normalizeUserEmailIdentity(email: string): string {
	return email.trim().toLowerCase();
}

export async function findUserEmailIdentityByEmail(
	client: SupabaseClient,
	email: string
): Promise<UserEmailIdentity | null> {
	const normalizedEmail = normalizeUserEmailIdentity(email);
	const { data, error } = await client
		.from('user_email_identities')
		.select('user_id, normalized_email')
		.eq('normalized_email', normalizedEmail)
		.maybeSingle<UserEmailIdentityRow>();

	if (error) {
		throw error;
	}

	return data ? { userId: data.user_id, normalizedEmail: data.normalized_email } : null;
}

export async function upsertUserEmailIdentity(
	client: SupabaseClient,
	input: { userId: string; email: string }
): Promise<void> {
	const { error } = await client.from('user_email_identities').upsert(
		{
			user_id: input.userId,
			normalized_email: normalizeUserEmailIdentity(input.email)
		},
		{ onConflict: 'user_id' }
	);

	if (error) {
		throw error;
	}
}
