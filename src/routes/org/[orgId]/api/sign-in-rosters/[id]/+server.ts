import { deleteSignInRoster } from '$features/sign-in-rosters/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestSignInRosterUploadContext } from '$lib/server/adapters/requestContexts.server';
import type { RequestEvent } from '@sveltejs/kit';

export const _deleteConfig: RouteConfig<
	{ rosterId: string },
	unknown,
	ReturnType<typeof createRequestSignInRosterUploadContext>
> = {
	context: createRequestSignInRosterUploadContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.manageSignInRosters,
	policyResource: { kind: 'unscoped' },
	parseInput: (event: RequestEvent) => ({ rosterId: event.params.id as string }),
	fn: (ctx, input) => deleteSignInRoster(ctx, input.rosterId)
};

export const DELETE = handle(_deleteConfig);
