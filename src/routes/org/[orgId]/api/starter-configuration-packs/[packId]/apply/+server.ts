import { z } from 'zod';
import type { RequestEvent } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { applyStarterConfigurationPack } from '$lib/server/core/useCases/starterConfigurationPacks';
import type { StarterConfigurationPackApplyResult } from '$lib/types/starterConfigurationPacks';

const applyStarterPackInput = z.object({
	packId: z.string().trim().min(1)
});

function parseApplyStarterPackInput(event: RequestEvent): z.infer<typeof applyStarterPackInput> {
	return { packId: event.params.packId ?? '' };
}

const applyStarterPackConfig = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.configureRequirements,
	policyResource: { kind: 'organization' },
	input: applyStarterPackInput,
	parseInput: parseApplyStarterPackInput,
	fn: (ctx, input) => applyStarterConfigurationPack(ctx, input.packId)
} satisfies RouteConfig<z.infer<typeof applyStarterPackInput>, StarterConfigurationPackApplyResult>;

export const POST = handle(applyStarterPackConfig);
export const _postConfig = applyStarterPackConfig;
