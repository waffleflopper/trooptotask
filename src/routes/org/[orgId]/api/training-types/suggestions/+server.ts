import { trainingSuggestionsInputSchema } from '$features/training/contracts';
import { applyTrainingSuggestions } from '$features/training/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createSupabaseOrganizationSetupPort, type OrganizationSetupPort } from '$features/organization/index.server';
import { handle, privateJson } from '$lib/server/adapters/httpAdapter';
import type { AdmittedOrganizationRequest } from '$lib/server/adapters/requestContexts.server';
import { createRequestTrainingCatalogContext } from '$lib/server/adapters/featureRequestContexts.server';

export const _postConfig = {
	context: createRequestTrainingCatalogContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.configureRequirements,
	policyResource: { kind: 'organization' as const },
	input: trainingSuggestionsInputSchema,
	fn: applyTrainingSuggestions
};

export const POST = handle(_postConfig);

/** The branch the starter list is chosen by, for a Training configurer who never ran setup's Training step. */
export const _getConfig = {
	context: (request: AdmittedOrganizationRequest) => ({
		orgId: request.auth.orgId,
		organizationSetup: createSupabaseOrganizationSetupPort(request.supabase)
	}),
	policyAction: POLICY_ACTION_CATALOG.training.configureRequirements,
	policyResource: { kind: 'organization' as const },
	formatOutput: privateJson,
	fn: async ({
		orgId,
		organizationSetup
	}: {
		orgId: string;
		organizationSetup: Pick<OrganizationSetupPort, 'read'>;
	}) => ({
		branch: (await organizationSetup.read(orgId)).branch
	})
};

export const GET = handle(_getConfig);
