import {
	createSignInRoster,
	listSignInRosters,
	type SignInRosterListInput
} from '$features/sign-in-rosters/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import {
	createRequestSignInRosterContext,
	createRequestSignInRosterCreationContext
} from '$lib/server/adapters/requestContexts.server';
import { json, type RequestEvent } from '@sveltejs/kit';

export const _getConfig: RouteConfig<
	SignInRosterListInput,
	unknown,
	ReturnType<typeof createRequestSignInRosterContext>
> = {
	context: createRequestSignInRosterContext,
	policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: (event: RequestEvent) => ({
		title: event.url.searchParams.get('title') || '',
		from: event.url.searchParams.get('from'),
		to: event.url.searchParams.get('to'),
		limit: Math.min(parseInt(event.url.searchParams.get('limit') || '20'), 100),
		offset: parseInt(event.url.searchParams.get('offset') || '0')
	}),
	fn: (ctx, input) => listSignInRosters(ctx, input)
};

export const GET = handle(_getConfig);

export const _postConfig: RouteConfig<
	Record<string, unknown>,
	unknown,
	ReturnType<typeof createRequestSignInRosterCreationContext>
> = {
	context: createRequestSignInRosterCreationContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.manageSignInRosters,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => createSignInRoster(ctx, input),
	formatOutput: (result) => json(result)
};

export const POST = handle(_postConfig);
