type EmailConfirmationStatus = 'confirmed' | 'unconfirmed' | 'unavailable';

export interface CurrentUserEmailConfirmation {
	status: EmailConfirmationStatus;
	email: string | null;
}

export async function verifyCurrentUserEmailConfirmation(
	locals: Pick<App.Locals, 'supabase'>,
	expectedUser: Pick<NonNullable<App.Locals['user']>, 'id' | 'email'>
): Promise<CurrentUserEmailConfirmation> {
	try {
		const { data, error } = await locals.supabase.auth.getUser();

		if (error) {
			console.error('[org/new] auth.getUser email confirmation verification failed:', error);
			return unavailableConfirmation(expectedUser.email ?? null);
		}

		const providerUser = data?.user;
		if (!providerUser) return unavailableConfirmation(expectedUser.email ?? null);

		if (providerUser.id !== expectedUser.id) {
			console.error('[org/new] auth.getUser returned an unexpected user during email confirmation verification');
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
	} catch (error) {
		console.error('[org/new] auth.getUser email confirmation verification threw:', error);
		return unavailableConfirmation(expectedUser.email ?? null);
	}
}

function unavailableConfirmation(email: string | null): CurrentUserEmailConfirmation {
	return { status: 'unavailable', email };
}

function hasTimestamp(value: string | null | undefined): boolean {
	return typeof value === 'string' && value.trim().length > 0;
}
