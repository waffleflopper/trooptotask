import type { RequestEvent } from '@sveltejs/kit';
import { createSupabasePlatformAudit } from '$lib/audit/index.server';
import {
	createOrganizationSupportReader,
	createSupabaseOrganizationPlatformMembershipPort
} from '$features/organization/index.server';
import { createPersonnelSupportReader } from '$features/personnel/index.server';
import type { PlatformOrganizationLedgerInput } from '../organizationSupportTypes';
import { admitPlatformAdministrator } from './admission.server';
import { createPlatformOrganizationLedger } from './organizationLedger.server';
import { createPlatformOrganizationDetail } from './organizationDetail.server';

/** Used Organization support operations; privileged clients remain at this private delivery edge. */
export async function createPlatformOrganizationOperations(event: RequestEvent) {
	const { adminClient } = await admitPlatformAdministrator(event);
	const organizations = createOrganizationSupportReader(adminClient);
	const personnel = createPersonnelSupportReader(adminClient);
	const ledger = createPlatformOrganizationLedger({ store: organizations, personnel });
	const detail = createPlatformOrganizationDetail({
		store: organizations,
		personnel,
		membershipReader: createSupabaseOrganizationPlatformMembershipPort(adminClient),
		audit: createSupabasePlatformAudit(adminClient)
	});
	return {
		listOrganizations: (input: PlatformOrganizationLedgerInput) => ledger.listOrganizations(input),
		getOrganizationDetail: detail.getOrganizationDetail
	};
}
