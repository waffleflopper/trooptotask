import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { createPlatformActivityOperations } from '$features/platform-admin/index.server';
import { activityTimeZone, parseActivityQuery } from '$features/platform-admin/activityQuery';

export const GET: RequestHandler = async (event) => {
	const operations = await createPlatformActivityOperations(event);
	try {
		return json(
			await operations.list(
				parseActivityQuery(event.url.searchParams),
				activityTimeZone(event.url.searchParams.get('tz'))
			)
		);
	} catch (cause) {
		console.error('Failed to load platform Activity', cause);
		error(500, 'Unable to load Activity');
	}
};
