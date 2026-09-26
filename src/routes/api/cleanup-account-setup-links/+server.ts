import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cleanupAccountSetupLinks } from '$features/identity/index.server';
import { assertCronEndpointAuthorized } from '$lib/server/cronEndpointAuth';

export const GET: RequestHandler = async ({ request }) => {
	assertCronEndpointAuthorized(request.headers.get('authorization'), [env.CLEANUP_SECRET, env.CRON_SECRET]);

	const result = await cleanupAccountSetupLinks();

	return json(result);
};
