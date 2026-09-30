import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminClient } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { createSupabaseNotificationDelivery } from '$features/notifications/index.server';
import { createSupabaseOrganizationAdministratorRecipients } from '$features/organization/index.server';
import {
	cleanupExpiredOnboardings,
	type OnboardingRetentionCleanupResult,
	type OnboardingRetentionOrgConfig
} from '$lib/server/core/useCases/onboardingRetention';
import {
	mapArchiveRetentionOrgConfigs,
	type ArchiveRetentionSettingsRow
} from '$lib/server/core/useCases/retentionSupport';
import { assertCronEndpointAuthorized } from '$lib/server/cronEndpointAuth';
import { sanitizeErrorForLog } from '$lib/server/logSanitize';

interface OnboardingRetentionEndpointEnv {
	CLEANUP_SECRET?: string;
	CRON_SECRET?: string;
}

interface OnboardingRetentionEndpointInput {
	request: Request;
	env: OnboardingRetentionEndpointEnv;
	loadOrgRows: () => Promise<{ data: ArchiveRetentionSettingsRow[] | null; error: unknown }>;
	runCleanup: (orgConfigs: OnboardingRetentionOrgConfig[]) => Promise<OnboardingRetentionCleanupResult>;
}

async function runOnboardingRetentionCleanupEndpoint(input: OnboardingRetentionEndpointInput): Promise<Response> {
	assertCronEndpointAuthorized(input.request.headers.get('authorization'), [
		input.env.CLEANUP_SECRET,
		input.env.CRON_SECRET
	]);

	const { data: orgs, error: orgError } = await input.loadOrgRows();
	if (orgError) {
		console.error(
			'[cleanup-expired-onboardings] Failed to load organization retention settings:',
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
	const notifications = createSupabaseNotificationDelivery({
		getAdminClient: () => admin,
		resolveAdministratorRecipients: createSupabaseOrganizationAdministratorRecipients(() => admin),
		failureMode: 'required'
	});

	return runOnboardingRetentionCleanupEndpoint({
		request,
		env: {
			CLEANUP_SECRET: env.CLEANUP_SECRET,
			CRON_SECRET: env.CRON_SECRET
		},
		loadOrgRows: async () => admin.from('organizations').select('id, archive_retention_months'),
		runCleanup: (configs) => cleanupExpiredOnboardings({ store, notifications }, configs)
	});
};
