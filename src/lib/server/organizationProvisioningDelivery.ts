import { createSupabaseOrgProvisioningPort } from '$features/organization/index.server';
import { seedDefaultGroups, seedDefaultRankCatalog } from '$features/personnel/index.server';
import { seedFederalHolidays } from '$features/calendar/index.server';

/** Compose Organization creation with Personnel's Group and rank defaults at the request boundary. */
export function createOrganizationProvisioningDelivery(locals: Pick<App.Locals, 'supabase'>) {
	return createSupabaseOrgProvisioningPort(
		locals,
		(orgId) => seedDefaultGroups(locals.supabase, orgId),
		(orgId) => seedDefaultRankCatalog(locals.supabase, orgId),
		(orgId) => seedFederalHolidays(locals.supabase, orgId)
	);
}
