import { getSignedScanUrl, removeSignedScan, uploadSignedScan } from '$features/sign-in-rosters/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import {
	createRequestSignInRosterContext,
	createRequestSignInRosterUploadContext
} from '$lib/server/adapters/requestContexts.server';
import { json, type RequestEvent } from '@sveltejs/kit';

export const _getConfig: RouteConfig<
	{ rosterId: string },
	{ url: string },
	ReturnType<typeof createRequestSignInRosterContext>
> = {
	context: createRequestSignInRosterContext,
	policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: (event: RequestEvent) => ({ rosterId: event.params.id as string }),
	fn: (ctx, input) => getSignedScanUrl(ctx, input.rosterId)
};

export const GET = handle(_getConfig);

export const _postConfig: RouteConfig<
	{ rosterId: string; file: File | null },
	{ filePath: string },
	ReturnType<typeof createRequestSignInRosterUploadContext>
> = {
	context: createRequestSignInRosterUploadContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.manageSignInRosters,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event: RequestEvent) => {
		const formData = await event.request.formData();
		return { rosterId: event.params.id as string, file: formData.get('file') as File | null };
	},
	fn: async (ctx, input) => {
		return uploadSignedScan(ctx, input.rosterId, input.file);
	},
	formatOutput: (result) => json(result)
};

export const POST = handle(_postConfig);

export const _deleteConfig: RouteConfig<
	{ rosterId: string },
	{ success: boolean },
	ReturnType<typeof createRequestSignInRosterUploadContext>
> = {
	context: createRequestSignInRosterUploadContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.manageSignInRosters,
	policyResource: { kind: 'unscoped' },
	parseInput: (event: RequestEvent) => ({ rosterId: event.params.id as string }),
	fn: (ctx, input) => removeSignedScan(ctx, input.rosterId)
};

export const DELETE = handle(_deleteConfig);
