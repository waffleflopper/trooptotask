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
import { fail } from '$lib/errors';
import { isDateOnly } from '$lib/utils/dates';
import { DATE_ONLY_MESSAGE } from '$lib/utils/inputSchemas';

/** A missing or malformed paging value falls back to 0 rather than reaching the query as NaN. */
function nonNegativeIntegerParam(value: string | null): number {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function dateParam(value: string | null): string | null {
	if (value && !isDateOnly(value)) fail(400, DATE_ONLY_MESSAGE);
	return value;
}

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
		from: dateParam(event.url.searchParams.get('from')),
		to: dateParam(event.url.searchParams.get('to')),
		limit: Math.min(nonNegativeIntegerParam(event.url.searchParams.get('limit')) || 20, 100),
		offset: nonNegativeIntegerParam(event.url.searchParams.get('offset'))
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
