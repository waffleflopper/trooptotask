import type { PageServerLoad } from './$types';
import { createPlatformAccountOperations } from '$features/platform-admin/index.server';

export const load: PageServerLoad = async (event) => {
	const operations = await createPlatformAccountOperations(event);
	const search = event.url.searchParams.get('search') || '';
	const parsedPage = parseInt(event.url.searchParams.get('page') || '1');
	const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

	return operations.listUsers({ search, page, limit: 20 });
};
