import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createPlatformPeopleOperations } from '$features/platform-admin/index.server';

export const GET: RequestHandler = async (event) => {
	await createPlatformPeopleOperations(event);
	redirect(308, `/admin/people${event.url.search}`);
};
