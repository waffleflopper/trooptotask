import { json, type RequestEvent } from '@sveltejs/kit';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import {
	createSignInRosterPersistence,
	getSignedScanUrl,
	removeSignedScan,
	uploadSignedScan
} from '$features/sign-in-rosters/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

export const _getConfig: RouteConfig<{ rosterId: string }, { url: string }> = {
	policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: (event: RequestEvent) => ({ rosterId: event.params.id as string }),
	fn: (ctx, input) =>
		getSignedScanUrl(
			{
				orgId: ctx.auth.orgId,
				persistence: createSignInRosterPersistence(ctx.store, ctx.auth.orgId),
				storage: ctx.storage,
				audit: ctx.audit
			},
			input.rosterId
		)
};

export const GET = handle(_getConfig);

export const _postConfig: RouteConfig<{ rosterId: string; file: File | null }, { filePath: string }> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.manageSignInRosters,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event: RequestEvent) => {
		const formData = await event.request.formData();
		return { rosterId: event.params.id as string, file: formData.get('file') as File | null };
	},
	fn: (ctx, input) =>
		uploadSignedScan(
			{
				orgId: ctx.auth.orgId,
				persistence: createSignInRosterPersistence(ctx.store, ctx.auth.orgId),
				storage: ctx.storage,
				audit: ctx.audit
			},
			input.rosterId,
			input.file
		),
	formatOutput: (result) => json(result)
};

export const POST = handle(_postConfig);

export const _deleteConfig: RouteConfig<{ rosterId: string }, { success: boolean }> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.manageSignInRosters,
	policyResource: { kind: 'unscoped' },
	parseInput: (event: RequestEvent) => ({ rosterId: event.params.id as string }),
	fn: (ctx, input) =>
		removeSignedScan(
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
