import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { createPlatformOrganizationOperations } from '$features/platform-admin/index.server';

export const load: PageServerLoad = async (event) => {
	const operations = await createPlatformOrganizationOperations(event);
	try {
		return await operations.listOrganizations({
			page: event.url.searchParams.get('page'),
			pageSize: event.url.searchParams.get('pageSize'),
			q: event.url.searchParams.get('q'),
			status: event.url.searchParams.get('status')
		});
	} catch (err) {
		console.error('Admin orgs query failed:', err);
		error(500, 'Unable to load platform organizations.');
	}
};
