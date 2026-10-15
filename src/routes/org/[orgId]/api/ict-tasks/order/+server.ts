import { reorderIctTasks } from '$features/critical-tasks/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createRequestCriticalTaskLibraryContext } from '$lib/server/adapters/featureRequestContexts.server';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';

export const _postConfig = {
	context: createRequestCriticalTaskLibraryContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.criticalTasks.configureLibrary,
	policyResource: { kind: 'unscoped' },
	fn: reorderIctTasks
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestCriticalTaskLibraryContext>>;

export const POST = handle(_postConfig);
