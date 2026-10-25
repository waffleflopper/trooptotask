import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createPlatformPeopleOperations } from '$features/platform-admin/index.server';
import { validateUUID } from '$lib/server/validation';

export const GET: RequestHandler = async (event) => {
	await createPlatformPeopleOperations(event);
	if (!validateUUID(event.params.userId)) error(400, 'Invalid account ID');
	redirect(308, `/admin/people/${event.params.userId}${event.url.search}`);
};
