import { isPublicPageSignedIn } from '$features/identity/index.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	return { signedIn: isPublicPageSignedIn(locals.user, locals.mfaPending, locals.authFlow) };
};
