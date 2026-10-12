import type { LayoutServerLoad } from './$types';
import { getIdentityViewer } from '$features/identity/index.server';

export const load: LayoutServerLoad = async ({ locals }) => {
	return { viewer: getIdentityViewer(locals.actor, locals.user) };
};
