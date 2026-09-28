import type { RequestEvent } from '@sveltejs/kit';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createSignInRosterPersistence, deleteSignInRoster } from '$features/sign-in-rosters/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

export const _deleteConfig: RouteConfig<{ rosterId: string }, unknown> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.manageSignInRosters,
	policyResource: { kind: 'unscoped' },
	parseInput: (event: RequestEvent) => ({ rosterId: event.params.id as string }),
	fn: (ctx, input) =>
		deleteSignInRoster(
			{
				orgId: ctx.auth.orgId,
				persistence: createSignInRosterPersistence(ctx.store, ctx.auth.orgId),
				storage: ctx.storage,
				audit: ctx.audit
			},
			input.rosterId
		)
};

export const DELETE = handle(_deleteConfig);
