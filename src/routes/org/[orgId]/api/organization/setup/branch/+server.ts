import { setupBranchInputSchema } from '$features/organization/contracts';
import { saveOrganizationSetupBranch } from '$features/organization/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle } from '$lib/server/adapters/httpAdapter';
import { createSetupBranchWriteContext } from '../setupContext.server';

export const _postConfig = {
	context: createSetupBranchWriteContext,
	policyAction: POLICY_ACTION_CATALOG.organization.updateSettings,
	policyResource: { kind: 'organization' as const },
	mutation: true,
	input: setupBranchInputSchema,
	fn: saveOrganizationSetupBranch
};
export const POST = handle(_postConfig);
