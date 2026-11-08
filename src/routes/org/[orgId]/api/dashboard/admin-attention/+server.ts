import { fetchDashboardAdminAttention } from '$features/dashboard/index.server';
import type { AdminAttentionSnapshot } from '$features/organization/contracts';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, privateJson, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestAdminAttentionContext } from '$lib/server/adapters/requestContexts.server';

export const _getConfig: RouteConfig<
	undefined,
	AdminAttentionSnapshot | null,
	ReturnType<typeof createRequestAdminAttentionContext>
> = {
	context: createRequestAdminAttentionContext,
	policyAction: POLICY_ACTION_CATALOG.identity.viewDashboard,
	fn: (ctx) => fetchDashboardAdminAttention(ctx),
	formatOutput: privateJson
};

export const GET = handle(_getConfig);
