import type { SupabaseClient } from '@supabase/supabase-js';
import type { CurrentUserEmailConfirmation } from './contracts';

export async function verifyCurrentUserEmailConfirmation(
	{ supabase }: { supabase: SupabaseClient },
	expectedUser: { userId: string; email?: string | null }
): Promise<CurrentUserEmailConfirmation> {
	try {
		const { data, error } = await supabase.auth.getUser();

		if (error) {
			console.error('Email confirmation verification failed');
			return unavailableConfirmation(expectedUser.email ?? null);
		}

		const providerUser = data?.user;
		if (!providerUser) return unavailableConfirmation(expectedUser.email ?? null);

		if (providerUser.id !== expectedUser.userId) {
			console.error('Email confirmation verification returned an unexpected user');
			return unavailableConfirmation(expectedUser.email ?? null);
		}

		const email = providerUser.email ?? expectedUser.email ?? null;
		if (!email) return unavailableConfirmation(null);

		return {
			status:
				hasTimestamp(providerUser.email_confirmed_at) || hasTimestamp(providerUser.confirmed_at)
					? 'confirmed'
					: 'unconfirmed',
			email
		};
	} catch {
		console.error('Email confirmation verification unavailable');
		return unavailableConfirmation(expectedUser.email ?? null);
	}
}

function unavailableConfirmation(email: string | null): CurrentUserEmailConfirmation {
	return { status: 'unavailable', email };
}

function hasTimestamp(value: string | null | undefined): boolean {
	return typeof value === 'string' && value.trim().length > 0;
}
