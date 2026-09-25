import { bindLeaderNoteDataSource } from '$lib/server/adapters/leaderNoteDataSource';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { createSupabaseStorageAdapter } from '$lib/server/adapters/supabaseStorage';
import { createSupabaseAssignmentTypeRetention } from '$lib/server/adapters/supabaseAssignmentTypeRetention';
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

interface ArchiveRetentionEndpointInput {
	loadOrgRows: () => Promise<{ data: ArchiveRetentionSettingsRow[] | null; error: unknown }>;
	runCleanup: (orgConfigs: ArchiveRetentionOrgConfig[]) => Promise<ArchiveRetentionCleanupResult>;
}

async function runArchiveRetentionCleanupEndpoint(input: ArchiveRetentionEndpointInput): Promise<Response> {
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
	assertCronEndpointAuthorized(request.headers.get('authorization'), [env.CLEANUP_SECRET, env.CRON_SECRET]);
	const admin = getAdminClient();
	const store = createSupabaseDataStore(admin);
	const storage = createSupabaseStorageAdapter(admin);
	const assignmentTypes = createSupabaseAssignmentTypeRetention(admin);
	const leaderNotes = bindLeaderNoteDataSource(store);

	return runArchiveRetentionCleanupEndpoint({
		loadOrgRows: async () => admin.from('organizations').select('id, archive_retention_months'),
		runCleanup: (configs) => cleanupArchivedRecords({ store, storage, assignmentTypes, leaderNotes }, configs)
	});
};
