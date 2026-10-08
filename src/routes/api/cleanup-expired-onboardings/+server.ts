import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { createOnboardingRetentionSources } from '$lib/server/adapters/scheduledMaintenanceSources.server';
import type { OrganizationRetentionConfiguration } from '$features/organization/contracts';
import { cleanupExpiredOnboardings } from '$features/onboarding/index.server';
import { assertCronEndpointAuthorized } from '$features/scheduled-maintenance/index.server';
import { sanitizeErrorForLog } from '$lib/utils/logSanitize';

export const GET: RequestHandler = async ({ request }) => {
	assertCronEndpointAuthorized(request.headers.get('authorization'), [env.CLEANUP_SECRET, env.CRON_SECRET]);
	const { settings, store, notifications } = createOnboardingRetentionSources();
	let orgConfigs: OrganizationRetentionConfiguration[];
	try {
		orgConfigs = await settings.listConfigurations();
	} catch (orgError) {
		console.error(
			'[cleanup-expired-onboardings] Failed to load organization retention settings:',
			sanitizeErrorForLog(orgError)
		);
		throw error(500, 'Internal server error');
	}
	return json(await cleanupExpiredOnboardings({ store, notifications }, orgConfigs));
};
