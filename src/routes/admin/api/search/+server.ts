import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { createPlatformSearchOperations } from '$features/platform-admin/index.server';

export const GET: RequestHandler = async (event) => {
	const operations = await createPlatformSearchOperations(event);
	try {
		return json(await operations.search({ query: event.url.searchParams.get('q') ?? '' }));
	} catch {
		error(500, 'Unable to search platform records');
	}
};
