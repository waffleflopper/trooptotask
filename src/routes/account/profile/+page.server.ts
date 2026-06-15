import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { ALL_RANKS } from '$lib/types';
import { loadCurrentUserProfile, parseUserProfileForm, upsertCurrentUserProfile } from '$lib/server/userProfile';
import { sanitizeErrorForLog } from '$lib/server/logSanitize';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/auth/login');

	return {
		profile: await loadCurrentUserProfile(locals),
		ranks: ALL_RANKS
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/auth/login');

		const formData = await request.formData();
		const profile = parseUserProfileForm({
			firstName: formData.get('firstName'),
			lastName: formData.get('lastName'),
			rank: formData.get('rank')
		});

		if ('error' in profile) {
			return fail(400, { error: profile.error });
		}

		try {
			await upsertCurrentUserProfile(locals, profile);
		} catch (error) {
			console.error('[profile] Failed to save profile:', sanitizeErrorForLog(error));
			return fail(500, { error: 'An internal server error occurred' });
		}

		return { success: 'Profile saved.' };
	}
};
