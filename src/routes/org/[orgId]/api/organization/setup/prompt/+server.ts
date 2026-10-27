import { setupPromptInputSchema } from '$features/organization/contracts';
import { saveOrganizationSetupPrompt } from '$features/organization/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle } from '$lib/server/adapters/httpAdapter';
import { createSetupWriteContext } from '../setupContext.server';

export const _postConfig = {
	context: createSetupWriteContext,
	policyAction: POLICY_ACTION_CATALOG.organization.updateSettings,
	policyResource: { kind: 'organization' as const },
	mutation: true,
	input: setupPromptInputSchema,
	fn: saveOrganizationSetupPrompt
};
export const POST = handle(_postConfig);
