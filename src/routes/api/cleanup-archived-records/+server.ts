import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { createSupabaseStorageAdapter } from '$lib/server/adapters/supabaseStorage';
import { createSupabaseAssignmentTypeRetention } from '$features/calendar/index.server';
import {
	createSupabasePersonnelArtifactRetentionSource,
	createSupabasePersonnelRetentionSource
} from '$features/personnel/index.server';
import { createSupabaseNotificationDelivery } from '$features/notifications/index.server';
import {
	createSupabaseOrganizationAdministratorRecipients,
	createSupabaseOrganizationRetentionSettingsReader
} from '$features/organization/index.server';
import { assertCronEndpointAuthorized } from '$lib/server/cronEndpointAuth';
import { getAdminClient } from '$lib/server/supabase';
import {
	cleanupArchivedRecords,
	type ArchiveRetentionCleanupResult,
	type ArchiveRetentionOrgConfig
} from '$lib/server/core/useCases/archiveRetention';
import { sanitizeErrorForLog } from '$lib/server/logSanitize';

interface ArchiveRetentionEndpointInput {
	loadOrgConfigs: () => Promise<ArchiveRetentionOrgConfig[]>;
	runCleanup: (orgConfigs: ArchiveRetentionOrgConfig[]) => Promise<ArchiveRetentionCleanupResult>;
}

async function runArchiveRetentionCleanupEndpoint(input: ArchiveRetentionEndpointInput): Promise<Response> {
	let orgConfigs: ArchiveRetentionOrgConfig[];
	try {
		orgConfigs = await input.loadOrgConfigs();
	} catch (orgError) {
		console.error(
			'[cleanup-archived-records] Failed to load organization retention settings:',
			sanitizeErrorForLog(orgError)
		);
		throw error(500, 'Internal server error');
	}

	return json(await input.runCleanup(orgConfigs));
}

export const GET: RequestHandler = async ({ request }) => {
	assertCronEndpointAuthorized(request.headers.get('authorization'), [env.CLEANUP_SECRET, env.CRON_SECRET]);
	const admin = getAdminClient();
	const settings = createSupabaseOrganizationRetentionSettingsReader(admin);
	const store = createSupabaseDataStore(admin);
	const storage = createSupabaseStorageAdapter(admin);
	const assignmentTypes = createSupabaseAssignmentTypeRetention(admin);
	const artifacts = createSupabasePersonnelArtifactRetentionSource(admin, storage);
	const personnel = createSupabasePersonnelRetentionSource(admin, storage);
	const notifications = createSupabaseNotificationDelivery({
		getAdminClient: () => admin,
		resolveAdministratorRecipients: createSupabaseOrganizationAdministratorRecipients(() => admin),
		failureMode: 'required'
	});

	return runArchiveRetentionCleanupEndpoint({
		loadOrgConfigs: () => settings.listConfigurations(),
		runCleanup: (configs) =>
			cleanupArchivedRecords({ store, assignmentTypes, artifacts, personnel, notifications }, configs)
	});
};
