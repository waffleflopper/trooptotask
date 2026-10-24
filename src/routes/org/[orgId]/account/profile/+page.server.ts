import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { BUILT_IN_ARMY_RANK_OPTIONS } from '$features/personnel/contracts';
import { parseUserProfileForm, upsertUserProfile } from '$features/identity/index.server';

// The profile itself arrives with the shell's first paint, so this page adds no read.
export const load: PageServerLoad = () => ({ ranks: BUILT_IN_ARMY_RANK_OPTIONS });

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.actor) redirect(303, '/auth/login');

		const formData = await request.formData();
		const profile = parseUserProfileForm(
			{
				firstName: formData.get('firstName'),
				lastName: formData.get('lastName'),
				rank: formData.get('rank')
			},
			BUILT_IN_ARMY_RANK_OPTIONS
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
};
