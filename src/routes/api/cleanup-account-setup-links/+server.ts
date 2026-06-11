import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAccountSetupLinkService, createSupabaseAccountSetupLinkStore } from '$lib/server/accountSetupLinks';
import { assertCronEndpointAuthorized } from '$lib/server/cronEndpointAuth';
import { getAdminClient } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ request }) => {
	assertCronEndpointAuthorized(request.headers.get('authorization'), [env.CLEANUP_SECRET, env.CRON_SECRET]);

	const admin = getAdminClient();
	const store = createSupabaseAccountSetupLinkStore(admin);
	const service = createAccountSetupLinkService(store);
	const result = await service.cleanupStaleLinks();

	return json(result);
};
