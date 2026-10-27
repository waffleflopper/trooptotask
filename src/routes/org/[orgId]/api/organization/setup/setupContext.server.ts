import { createSupabaseOrganizationSetupPort } from '$features/organization/index.server';
import type { SetupBranch } from '$features/organization/contracts';
import { configureOrganizationRankServices } from '$features/personnel/index.server';
import {
	createRequestRankCatalogContext,
	type AdmittedOrganizationRequest
} from '$lib/server/adapters/requestContexts.server';

export function createSetupWriteContext(request: AdmittedOrganizationRequest) {
	return {
		auth: request.auth,
		audit: request.audit,
		organizationSetup: createSupabaseOrganizationSetupPort(request.supabase)
	};
}

export function createSetupBranchWriteContext(request: AdmittedOrganizationRequest) {
	const ranks = createRequestRankCatalogContext(request);
	return {
		...createSetupWriteContext(request),
		configureBranchRanks: (service: SetupBranch) => configureOrganizationRankServices(ranks, { service })
	};
}
