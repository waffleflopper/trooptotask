import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from '@sveltejs/kit';
import { parseUserProfileForm, upsertUserProfile } from './userProfile.server';

export function createAccountProfilePage(ranks: readonly string[]) {
	const load = () => ({ ranks });
	const actions = {
		default: async ({ request, locals }) => {
			if (!locals.actor) redirect(303, '/auth/login');

			const formData = await request.formData();
			const profile = parseUserProfileForm(
				{
					firstName: formData.get('firstName'),
					lastName: formData.get('lastName'),
					rank: formData.get('rank')
				},
				ranks
			);

			if ('error' in profile) {
				return fail(400, { error: profile.error });
			}

			try {
				await upsertUserProfile(locals, locals.actor.userId, profile);
			} catch {
				console.error('[profile] Failed to save profile');
				return fail(500, { error: 'An internal server error occurred' });
			}

			return { success: 'Profile saved.' };
		}
	} satisfies Actions;

	return { load, actions };
}
