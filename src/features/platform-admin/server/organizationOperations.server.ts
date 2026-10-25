import type { RequestEvent } from '@sveltejs/kit';
import { createSupabasePlatformAudit } from '$lib/audit/index.server';
import type { PlatformOrganizationListInput } from '../organizationSupportTypes';
import { admitPlatformAdministrator } from './admission.server';
import {
	createSupabasePlatformOrganizationDirectory,
	normalizePlatformOrganizationListQuery
} from './organizationDirectory.server';

const RECENT_ACTIVITY_LIMIT = 10;

/** Organization support reads; the privileged client stays at this private delivery edge. */
export async function createPlatformOrganizationOperations(event: RequestEvent) {
	const { adminClient } = await admitPlatformAdministrator(event);
	const directory = createSupabasePlatformOrganizationDirectory(adminClient);
	const audit = createSupabasePlatformAudit(adminClient);
	return {
		/** The normalized query is returned at once so the page can show it while the page of Organizations loads. */
		listOrganizations: (input: PlatformOrganizationListInput) => {
			const query = normalizePlatformOrganizationListQuery(input);
			return { query, page: directory.listOrganizations(query) };
		},
		getOrganization: directory.getOrganization,
		listRecentActivity: (orgId: string) => audit.listRecentByOrganization({ orgId, limit: RECENT_ACTIVITY_LIMIT })
	};
}
