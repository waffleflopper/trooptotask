import { signOutIdentity } from '$features/identity/index.server';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request }) => {
	if (request.method !== 'POST') redirect(303, '/');
	return {};
};

export const actions: Actions = {
	default: async ({ locals, cookies }) => {
		const result = await signOutIdentity({ locals, cookies });
		if (result === 'unavailable') return fail(503, { error: 'Unable to confirm sign-out. Please try again.' });
		if (result === 'local-only') return { localOnly: true };
		redirect(303, '/');
	}
};
