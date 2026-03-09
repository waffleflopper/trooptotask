import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ parent }) => {
	const { userRole } = await parent();
	if (userRole !== 'owner' && userRole !== 'admin') {
		throw error(403, 'Only organization owners and admins can access admin features');
	}
};
