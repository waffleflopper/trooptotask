import {
	setupPromptInputSchema,
	setupPromptChoiceInputSchema,
	setupPromptStateForChoice
} from '$features/organization/contracts';
import { saveOrganizationSetupPrompt } from '$features/organization/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, readJsonBody } from '$lib/server/adapters/httpAdapter';
import { createSetupWriteContext } from '../setupContext.server';
import { viewerToday } from '$lib/server/viewerDay.server';
import { fail } from '$lib/errors';
import type { RequestEvent } from '@sveltejs/kit';

export const _postConfig = {
	context: createSetupWriteContext,
	policyAction: POLICY_ACTION_CATALOG.organization.updateSettings,
	policyResource: { kind: 'organization' as const },
	mutation: true,
	input: setupPromptInputSchema,
	parseInput: async (event: RequestEvent) => {
		const input = setupPromptChoiceInputSchema.safeParse(await readJsonBody(event));
		if (!input.success) fail(400, 'Invalid setup prompt choice');
		return {
			key: input.data.key,
			state: setupPromptStateForChoice(input.data.choice, viewerToday(event.cookies))
		};
	},
	fn: saveOrganizationSetupPrompt
};
export const POST = handle(_postConfig);
