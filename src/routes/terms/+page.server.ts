import { getPublicPageUser } from '$features/identity/index.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	return {
		user: getPublicPageUser(locals.user, locals.mfaPending, locals.authFlow)
	};
};
