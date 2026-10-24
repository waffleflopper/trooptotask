import { redirect } from '@sveltejs/kit';
import { getAuthenticatedRedirectPath } from '$features/identity/index.server';
import { sanitizeAuthNextPath } from '$features/identity/contracts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.actor) {
		redirect(303, locals.session ? getAuthenticatedRedirectPath(locals.authFlow, locals.mfaPending) : '/auth/login');
	}
	return { next: sanitizeAuthNextPath(url.searchParams.get('next')) ?? '/account/security' };
};
