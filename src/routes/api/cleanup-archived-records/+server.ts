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
import {
	mapArchiveRetentionOrgConfigs,
	type ArchiveRetentionSettingsRow
} from '$lib/server/core/useCases/retentionSupport';
import { sanitizeErrorForLog } from '$lib/server/logSanitize';

interface ArchiveRetentionEndpointEnv {
	CLEANUP_SECRET?: string;
	CRON_SECRET?: string;
}

interface ArchiveRetentionEndpointInput {
	request: Request;
	env: ArchiveRetentionEndpointEnv;
	loadOrgRows: () => Promise<{ data: ArchiveRetentionSettingsRow[] | null; error: unknown }>;
	runCleanup: (orgConfigs: ArchiveRetentionOrgConfig[]) => Promise<ArchiveRetentionCleanupResult>;
}

async function runArchiveRetentionCleanupEndpoint(input: ArchiveRetentionEndpointInput): Promise<Response> {
	assertCronEndpointAuthorized(input.request.headers.get('authorization'), [
		input.env.CLEANUP_SECRET,
		input.env.CRON_SECRET
	]);

	const { data: orgs, error: orgError } = await input.loadOrgRows();

	if (orgError) {
		console.error(
			'[cleanup-archived-records] Failed to load organization retention settings:',
			sanitizeErrorForLog(orgError)
		);
		throw error(500, 'Internal server error');
	}

	const orgConfigs = mapArchiveRetentionOrgConfigs(orgs ?? []);

	return json(await input.runCleanup(orgConfigs));
}

export const GET: RequestHandler = async ({ request }) => {
	const admin = getAdminClient();
	const store = createSupabaseDataStore(admin);
	const storage = createSupabaseStorageAdapter(admin);

	return runArchiveRetentionCleanupEndpoint({
		request,
		env: {
			CLEANUP_SECRET: env.CLEANUP_SECRET,
			CRON_SECRET: env.CRON_SECRET
		},
		loadOrgRows: async () => admin.from('organizations').select('id, archive_retention_months'),
		runCleanup: (configs) => cleanupArchivedRecords({ store, storage }, configs)
	});
};
