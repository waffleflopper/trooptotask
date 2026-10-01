import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminClient } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { createSupabaseNotificationDelivery } from '$features/notifications/index.server';
import { createSupabaseOrganizationAdministratorRecipients } from '$features/organization/index.server';
import { cleanupExpiredOnboardings, createSupabaseOnboardingRetentionSource } from '$features/onboarding/index.server';
import { mapArchiveRetentionOrgConfigs } from '$lib/server/core/useCases/retentionSupport';
import { assertCronEndpointAuthorized } from '$lib/server/cronEndpointAuth';
import { sanitizeErrorForLog } from '$lib/server/logSanitize';

export const GET: RequestHandler = async ({ request }) => {
	assertCronEndpointAuthorized(request.headers.get('authorization'), [env.CLEANUP_SECRET, env.CRON_SECRET]);
	const admin = getAdminClient();
	const { data: orgs, error: orgError } = await admin.from('organizations').select('id, archive_retention_months');
	if (orgError) {
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
			mapArchiveRetentionOrgConfigs(orgs ?? [])
		)
	);
};
