import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/auth/login');

	return {
		accountPathname: url.pathname
	};
};
