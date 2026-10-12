import {
	createSupabaseOrganizationCreationPort,
	type OrganizationDefaults,
	type OrgProvisioningPort
} from '$features/organization/index.server';
import { getPersonnelOrganizationDefaults } from '$features/personnel/index.server';
import { getCalendarOrganizationDefaults } from '$features/calendar/index.server';

/** Compose Organization creation with the defaults Personnel and Calendar own at the request boundary. */
export function createOrganizationProvisioningDelivery(locals: Pick<App.Locals, 'supabase'>): OrgProvisioningPort {
	const defaults: OrganizationDefaults = {
		...getPersonnelOrganizationDefaults(),
		...getCalendarOrganizationDefaults()
	};
	return createSupabaseOrganizationCreationPort(locals, defaults);
}
