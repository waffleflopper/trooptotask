import { json, type RequestEvent } from '@sveltejs/kit';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import {
	createSignInRoster,
	createSignInRosterPersistence,
	listSignInRosters,
	type SignInRosterListInput
} from '$features/sign-in-rosters/index.server';
import { findGroupNamesByIds, loadOrganizationRankCatalog } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

export const _getConfig: RouteConfig<SignInRosterListInput, unknown> = {
	policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: (event: RequestEvent) => ({
		title: event.url.searchParams.get('title') || '',
		from: event.url.searchParams.get('from'),
		to: event.url.searchParams.get('to'),
		limit: Math.min(parseInt(event.url.searchParams.get('limit') || '20'), 100),
		offset: parseInt(event.url.searchParams.get('offset') || '0')
	}),
	fn: (ctx, input) =>
		listSignInRosters(
			{
				orgId: ctx.auth.orgId,
				persistence: createSignInRosterPersistence(ctx.store, ctx.auth.orgId),
				storage: ctx.storage,
				audit: ctx.audit
			},
			input
		)
};

export const GET = handle(_getConfig);

export const _postConfig: RouteConfig<Record<string, unknown>, unknown> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.manageSignInRosters,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) =>
		createSignInRoster(
			{
				orgId: ctx.auth.orgId,
				userId: ctx.auth.userId,
				scopeSet: ctx.auth.scopeSet,
				persistence: createSignInRosterPersistence(ctx.store, ctx.auth.orgId),
				storage: ctx.storage,
				audit: ctx.audit,
				personnelLookup: ctx.signInRosterPersonnelLookup,
				findGroupNamesByIds: (groupIds) => findGroupNamesByIds({ auth: ctx.auth, store: ctx.rawStore }, groupIds),
				loadRankCatalog: () =>
					loadOrganizationRankCatalog({ auth: ctx.auth, store: ctx.rawStore }, { authorization: 'training-records' })
			},
			input
		),
	formatOutput: (result) => json(result)
};

export const POST = handle(_postConfig);
