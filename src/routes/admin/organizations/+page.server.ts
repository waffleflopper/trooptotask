import type { PageServerLoad } from './$types';
import { createPlatformOrganizationOperations } from '$features/platform-admin/index.server';

export const load: PageServerLoad = async (event) => {
	const operations = await createPlatformOrganizationOperations(event);
	const input = {
		page: event.url.searchParams.get('page'),
		q: event.url.searchParams.get('q'),
		filter: event.url.searchParams.get('filter')
	};
	const { query, page } = operations.listOrganizations(input);
	return {
		query,
		// The page streams so the toolbar and skeleton paint first; a failed read becomes a retryable state, not an empty list.
		directory: page.then(
			(loaded) => ({ status: 'ready' as const, page: loaded }),
			(cause: unknown) => {
				console.error('Admin organizations query failed:', cause);
				return { status: 'failed' as const };
			}
		)
	};
};
