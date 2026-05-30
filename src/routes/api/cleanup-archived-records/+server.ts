import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { createSupabaseStorageAdapter } from '$lib/server/adapters/supabaseStorage';
import { getAdminClient } from '$lib/server/supabase';
import {
	cleanupArchivedRecords,
	type ArchiveRetentionCleanupResult,
	type ArchiveRetentionOrgConfig
} from '$lib/server/core/useCases/archiveRetention';

export interface ArchiveRetentionEndpointCoreInput {
	request: Request;
	cleanupSecret?: string;
	cronSecret?: string;
	orgConfigs: ArchiveRetentionOrgConfig[];
	runCleanup: (orgConfigs: ArchiveRetentionOrgConfig[]) => Promise<ArchiveRetentionCleanupResult>;
}

function isAuthorized(request: Request, cleanupSecret?: string, cronSecret?: string): boolean {
	const authHeader = request.headers.get('authorization');
	return (
		(typeof cleanupSecret === 'string' && authHeader === `Bearer ${cleanupSecret}`) ||
		(typeof cronSecret === 'string' && authHeader === `Bearer ${cronSecret}`)
	);
}

export async function _runArchiveRetentionCleanupEndpointCore(
	input: ArchiveRetentionEndpointCoreInput
): Promise<Response> {
	if (!isAuthorized(input.request, input.cleanupSecret, input.cronSecret)) {
		throw error(401, 'Unauthorized');
	}

	return json(await input.runCleanup(input.orgConfigs));
}

export const GET: RequestHandler = async ({ request }) => {
	if (!isAuthorized(request, env.CLEANUP_SECRET, env.CRON_SECRET)) {
		throw error(401, 'Unauthorized');
	}

	const admin = getAdminClient();
	const { data: orgs, error: orgError } = await admin.from('organizations').select('id, archive_retention_months');

	if (orgError) {
		throw error(500, orgError.message);
	}

	const orgConfigs = (orgs ?? []).map((org) => ({
		id: org.id as string,
		retentionMonths: org.archive_retention_months as number | null
	}));
	const store = createSupabaseDataStore(admin);
	const storage = createSupabaseStorageAdapter(admin);

	return _runArchiveRetentionCleanupEndpointCore({
		request,
		cleanupSecret: env.CLEANUP_SECRET,
		cronSecret: env.CRON_SECRET,
		orgConfigs,
		runCleanup: (configs) => cleanupArchivedRecords({ store, storage }, configs)
	});
};
