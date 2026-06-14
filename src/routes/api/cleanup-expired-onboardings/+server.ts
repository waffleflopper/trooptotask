import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminClient } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import {
	cleanupExpiredOnboardings,
	type OnboardingRetentionCleanupResult,
	type OnboardingRetentionOrgConfig
} from '$lib/server/core/useCases/onboardingRetention';
import { mapArchiveRetentionOrgConfigs } from '$lib/server/core/useCases/retentionSupport';
import { assertCronEndpointAuthorized } from '$lib/server/cronEndpointAuth';

interface OnboardingRetentionEndpointEnv {
	CLEANUP_SECRET?: string;
	CRON_SECRET?: string;
}

export interface OnboardingRetentionEndpointCoreInput {
	request: Request;
	env: OnboardingRetentionEndpointEnv;
	orgConfigs: OnboardingRetentionOrgConfig[];
	runCleanup: (orgConfigs: OnboardingRetentionOrgConfig[]) => Promise<OnboardingRetentionCleanupResult>;
}

export async function _runOnboardingRetentionCleanupEndpointCore(
	input: OnboardingRetentionEndpointCoreInput
): Promise<Response> {
	assertCronEndpointAuthorized(input.request.headers.get('authorization'), [
		input.env.CLEANUP_SECRET,
		input.env.CRON_SECRET
	]);

	return json(await input.runCleanup(input.orgConfigs));
}

export const GET: RequestHandler = async ({ request }) => {
	assertCronEndpointAuthorized(request.headers.get('authorization'), [env.CLEANUP_SECRET, env.CRON_SECRET]);

	const admin = getAdminClient();

	// Fetch all orgs with their retention settings
	const { data: orgs, error: orgError } = await admin.from('organizations').select('id, archive_retention_months');

	if (orgError) {
		throw error(500, orgError.message);
	}

	const orgConfigs = mapArchiveRetentionOrgConfigs(orgs ?? []);
	const store = createSupabaseDataStore(admin);

	return _runOnboardingRetentionCleanupEndpointCore({
		request,
		env: {
			CLEANUP_SECRET: env.CLEANUP_SECRET,
			CRON_SECRET: env.CRON_SECRET
		},
		orgConfigs,
		runCleanup: (configs) => cleanupExpiredOnboardings(store, configs)
	});
};
