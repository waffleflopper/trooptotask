import type { RequestEvent } from '@sveltejs/kit';
import { createSupabasePlatformAudit } from '$lib/audit/index.server';
import { createIdentityPlatformDashboardReader } from '$features/identity/index.server';
import { createOrganizationSupportReader } from '$features/organization/index.server';
import { countPendingFeedback } from '$features/feedback/index.server';
import { admitPlatformAdministrator } from './admission.server';
import { createPlatformDashboard } from './dashboard.server';
import { PLATFORM_ADMIN_PAGE_ROLES } from './navigation.server';

export async function createPlatformDashboardOperations(event: RequestEvent) {
	const { adminClient } = await admitPlatformAdministrator(event, PLATFORM_ADMIN_PAGE_ROLES.dashboard);
	return createPlatformDashboard({
		identity: createIdentityPlatformDashboardReader(adminClient),
		organizations: createOrganizationSupportReader(adminClient),
		feedback: { countPendingFeedback: () => countPendingFeedback(adminClient) },
		auditActivity: createSupabasePlatformAudit(adminClient)
	});
}
