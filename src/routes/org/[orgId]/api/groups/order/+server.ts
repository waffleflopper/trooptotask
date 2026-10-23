import { setGroupOrder } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestGroupContext } from '$lib/server/adapters/requestContexts.server';

export const _putConfig = {
	context: createRequestGroupContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageGroups,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		await setGroupOrder(ctx, input);
		return { success: true };
	}
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestGroupContext>>;

export const PUT = handle(_putConfig);
