import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createPlatformDashboardOperations } from '$features/platform-admin/index.server';

export const load: PageServerLoad = async (event) => {
	const operations = await createPlatformDashboardOperations(event);
	try {
		return await operations.dashboard();
	} catch (cause) {
		console.error('Failed to load admin Dashboard', cause);
		error(500, 'Internal server error');
	}
};
