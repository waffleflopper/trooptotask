import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { createSupabaseStorageAdapter } from '$lib/server/adapters/supabaseStorage';
import { assertCronEndpointAuthorized } from '$lib/server/cronEndpointAuth';
import { getAdminClient } from '$lib/server/supabase';
import {
	cleanupArchivedRecords,
	type ArchiveRetentionCleanupResult,
	type ArchiveRetentionOrgConfig
} from '$lib/server/core/useCases/archiveRetention';
import { mapArchiveRetentionOrgConfigs } from '$lib/server/core/useCases/retentionSupport';

interface ArchiveRetentionEndpointEnv {
	CLEANUP_SECRET?: string;
	CRON_SECRET?: string;
}

export interface ArchiveRetentionEndpointCoreInput {
	request: Request;
	env: ArchiveRetentionEndpointEnv;
	orgConfigs: ArchiveRetentionOrgConfig[];
	runCleanup: (orgConfigs: ArchiveRetentionOrgConfig[]) => Promise<ArchiveRetentionCleanupResult>;
}

export async function _runArchiveRetentionCleanupEndpointCore(
	input: ArchiveRetentionEndpointCoreInput
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
	const { data: orgs, error: orgError } = await admin.from('organizations').select('id, archive_retention_months');

	if (orgError) {
		throw error(500, orgError.message);
	}

	const orgConfigs = mapArchiveRetentionOrgConfigs(orgs ?? []);
	const store = createSupabaseDataStore(admin);
	const storage = createSupabaseStorageAdapter(admin);

	return _runArchiveRetentionCleanupEndpointCore({
		request,
		env: {
			CLEANUP_SECRET: env.CLEANUP_SECRET,
			CRON_SECRET: env.CRON_SECRET
		},
		orgConfigs,
		runCleanup: (configs) => cleanupArchivedRecords({ store, storage }, configs)
	});
};
