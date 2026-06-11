import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminClient } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { cleanupExpiredOnboardings } from '$lib/server/core/useCases/onboardingRetention';
import { assertCronEndpointAuthorized } from '$lib/server/cronEndpointAuth';

export const GET: RequestHandler = async ({ request }) => {
	assertCronEndpointAuthorized(request.headers.get('authorization'), [env.CLEANUP_SECRET, env.CRON_SECRET]);

	const admin = getAdminClient();

	// Fetch all orgs with their retention settings
	const { data: orgs, error: orgError } = await admin.from('organizations').select('id, archive_retention_months');

	if (orgError) {
		throw error(500, orgError.message);
	}

	if (!orgs || orgs.length === 0) {
		return json({ deletedCount: 0, orgsAffected: 0 });
	}

	const orgConfigs = orgs.map((org) => ({
		id: org.id as string,
		retentionMonths: (org.archive_retention_months as number) ?? 36
	}));

	const store = createSupabaseDataStore(admin);
	const result = await cleanupExpiredOnboardings(store, orgConfigs);

	return json(result);
};
