import type { SignedInAccount } from './contracts';
import { loadUserProfile } from './userProfile.server';

export async function loadStandaloneAccount(
	locals: Pick<App.Locals, 'supabase' | 'user'>,
	userId: string
): Promise<SignedInAccount & { id: string }> {
	const account = { id: userId, email: locals.user?.email ?? null, hasTwoFactor: null };
	try {
		const profile = await loadUserProfile(locals, userId);
		return {
			...account,
			profile: {
				status: 'loaded',
				profile: profile && {
					firstName: profile.firstName,
					lastName: profile.lastName,
					rank: profile.rank
				}
			}
		};
	} catch {
		console.error('[account] Failed to load user profile');
		return { ...account, profile: { status: 'unavailable' } };
	}
}
