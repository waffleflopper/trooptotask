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
import { z } from 'zod';

/** A missing or malformed paging value falls back to 0 rather than reaching the query as NaN. */
function nonNegativeIntegerParam(value: string | null): number {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

const instant = z.iso.datetime({ offset: true });

function instantParam(value: string | null): string | null {
	if (value && !instant.safeParse(value).success) fail(400, 'Use a valid date range');
	return value || null;
}

export const _getConfig: RouteConfig<
	SignInRosterListInput,
	unknown,
	ReturnType<typeof createRequestSignInRosterContext>
> = {
	context: createRequestSignInRosterContext,
	policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: (event: RequestEvent) => {
		// A tab loaded before the instant bounds still sends day-only from/to; refuse it rather than list every roster.
		if (event.url.searchParams.get('from') || event.url.searchParams.get('to')) fail(400, 'Use a valid date range');
		return {
			title: event.url.searchParams.get('title') || '',
			createdFrom: instantParam(event.url.searchParams.get('createdFrom')),
			createdBefore: instantParam(event.url.searchParams.get('createdBefore')),
			limit: Math.min(nonNegativeIntegerParam(event.url.searchParams.get('limit')) || 20, 100),
			offset: nonNegativeIntegerParam(event.url.searchParams.get('offset'))
		};
	},
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
