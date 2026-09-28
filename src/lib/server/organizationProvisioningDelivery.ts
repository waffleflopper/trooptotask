import { createSupabaseOrganizationCreationPort, type OrgProvisioningPort } from '$features/organization/index.server';
import { seedDefaultGroups, seedDefaultRankCatalog } from '$features/personnel/index.server';
import {
	seedDefaultAssignmentTypes,
	seedDefaultStatusTypes,
	seedFederalHolidays
} from '$features/calendar/index.server';

/** Compose Organization creation with Personnel's Group and rank defaults at the request boundary. */
export function createOrganizationProvisioningDelivery(locals: Pick<App.Locals, 'supabase'>): OrgProvisioningPort {
	return {
		...createSupabaseOrganizationCreationPort(locals),
		seedDefaultGroups: (orgId) => seedDefaultGroups(locals.supabase, orgId),
		seedDefaultStatusTypes: (orgId) => seedDefaultStatusTypes(locals.supabase, orgId),
		seedDefaultAssignmentTypes: (orgId) => seedDefaultAssignmentTypes(locals.supabase, orgId),
		seedFederalHolidays: (orgId) => seedFederalHolidays(locals.supabase, orgId),
		seedDefaultRankCatalog: (orgId) => seedDefaultRankCatalog(locals.supabase, orgId)
	};
}
