import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import type { OrganizationRetentionConfiguration } from '$features/organization/contracts';
import { assertCronEndpointAuthorized } from '$features/scheduled-maintenance/index.server';
import { createArchiveRetentionSources } from '$lib/server/adapters/scheduledMaintenanceSources.server';
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
	const { settings, criticalTasks, assignmentTypes, artifacts, personnel, files, notifications } =
		createArchiveRetentionSources();

	return runArchiveRetentionCleanupEndpoint({
		loadOrgConfigs: () => settings.listConfigurations(),
		runCleanup: (configs) =>
			cleanupArchivedRecords({ criticalTasks, assignmentTypes, artifacts, personnel, files, notifications }, configs)
	});
};
