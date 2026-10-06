import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { createSupabaseStorageAdapter } from '$lib/server/adapters/supabaseStorage';
import { createSupabaseCriticalTaskRetentionSource } from '$features/critical-tasks/index.server';
import type { OrganizationRetentionConfiguration } from '$features/organization/contracts';
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
import { assertCronEndpointAuthorized } from '$features/scheduled-maintenance/index.server';
import { getAdminClient } from '$lib/server/supabase';
import {
	cleanupArchivedRecords,
	type ArchiveRetentionCleanupResult
} from '$features/scheduled-maintenance/index.server';
import { sanitizeErrorForLog } from '$lib/utils/logSanitize';

interface ArchiveRetentionEndpointInput {
	loadOrgConfigs: () => Promise<OrganizationRetentionConfiguration[]>;
	runCleanup: (orgConfigs: OrganizationRetentionConfiguration[]) => Promise<ArchiveRetentionCleanupResult>;
}

async function runArchiveRetentionCleanupEndpoint(input: ArchiveRetentionEndpointInput): Promise<Response> {
	let orgConfigs: OrganizationRetentionConfiguration[];
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
	const criticalTasks = createSupabaseCriticalTaskRetentionSource(admin);
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
			cleanupArchivedRecords({ criticalTasks, assignmentTypes, artifacts, personnel, notifications }, configs)
	});
};
