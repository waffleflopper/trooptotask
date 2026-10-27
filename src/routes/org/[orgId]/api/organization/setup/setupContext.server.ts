import { createSupabaseOrganizationSetupPort } from '$features/organization/index.server';
import type { AdmittedOrganizationRequest } from '$lib/server/adapters/requestContexts.server';

export function createSetupWriteContext(request: AdmittedOrganizationRequest) {
	return {
		auth: request.auth,
		audit: request.audit,
		organizationSetup: createSupabaseOrganizationSetupPort(request.supabase)
	};
}
