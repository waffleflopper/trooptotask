import type { StarterConfigurationPackApplyResult } from '$features/dashboard/contracts';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestDataContext } from '$lib/server/adapters/requestContexts.server';
import { applyStarterConfigurationPack } from '$lib/server/core/useCases/starterConfigurationPacks';
import type { RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';

const applyStarterPackInput = z.object({
	packId: z.string().trim().min(1)
});

function parseApplyStarterPackInput(event: RequestEvent): z.infer<typeof applyStarterPackInput> {
	return { packId: event.params.packId ?? '' };
}

const applyStarterPackConfig = {
	context: createRequestDataContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.configureRequirements,
	policyResource: { kind: 'organization' },
	input: applyStarterPackInput,
	parseInput: parseApplyStarterPackInput,
	fn: (ctx, input) => applyStarterConfigurationPack(ctx, input.packId)
} satisfies RouteConfig<
	z.infer<typeof applyStarterPackInput>,
	StarterConfigurationPackApplyResult,
	ReturnType<typeof createRequestDataContext>
>;

export const POST = handle(applyStarterPackConfig);
export const _postConfig = applyStarterPackConfig;
