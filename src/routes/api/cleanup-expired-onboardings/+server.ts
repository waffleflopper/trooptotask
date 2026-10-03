import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminClient } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { createSupabaseNotificationDelivery } from '$features/notifications/index.server';
import {
	createSupabaseOrganizationAdministratorRecipients,
	createSupabaseOrganizationRetentionSettingsReader
} from '$features/organization/index.server';
import type { OrganizationRetentionConfiguration } from '$features/organization/contracts';
import { cleanupExpiredOnboardings, createSupabaseOnboardingRetentionSource } from '$features/onboarding/index.server';
import { assertCronEndpointAuthorized } from '$lib/server/cronEndpointAuth';
import { sanitizeErrorForLog } from '$lib/utils/logSanitize';

export const GET: RequestHandler = async ({ request }) => {
	assertCronEndpointAuthorized(request.headers.get('authorization'), [env.CLEANUP_SECRET, env.CRON_SECRET]);
	const admin = getAdminClient();
	let orgConfigs: OrganizationRetentionConfiguration[];
	try {
		orgConfigs = await createSupabaseOrganizationRetentionSettingsReader(admin).listConfigurations();
	} catch (orgError) {
		console.error(
			'[cleanup-expired-onboardings] Failed to load organization retention settings:',
			sanitizeErrorForLog(orgError)
		);
		throw error(500, 'Internal server error');
	}
	const store = createSupabaseDataStore(admin);
	const notifications = createSupabaseNotificationDelivery({
		getAdminClient: () => admin,
		resolveAdministratorRecipients: createSupabaseOrganizationAdministratorRecipients(() => admin),
		failureMode: 'required'
	});
	return json(
		await cleanupExpiredOnboardings(
			{ store: { findMany: store.findMany, ...createSupabaseOnboardingRetentionSource(admin) }, notifications },
			orgConfigs
		)
	);
};
