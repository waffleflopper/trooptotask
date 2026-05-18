import { env } from '$env/dynamic/private';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAccountSetupLinkService, createSupabaseAccountSetupLinkStore } from '$lib/server/accountSetupLinks';
import { getAdminClient } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ request }) => {
	const authHeader = request.headers.get('authorization');
	const cleanupSecret = env.CLEANUP_SECRET;
	const cronSecret = env.CRON_SECRET;

	const isAuthorized = authHeader === `Bearer ${cleanupSecret}` || authHeader === `Bearer ${cronSecret}`;

	if (!isAuthorized) {
		throw error(401, 'Unauthorized');
	}

	const admin = getAdminClient();
	const store = createSupabaseAccountSetupLinkStore(admin);
	const service = createAccountSetupLinkService(store);
	const result = await service.cleanupStaleLinks();

	return json(result);
};
