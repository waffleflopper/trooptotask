import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';
import {
	listDeletionRequests,
	createDeletionRequest,
	cancelDeletionRequest,
	type CreateDeletionRequestInput
} from '$lib/server/core/useCases/deletionRequests';

export const _getConfig: RouteConfig<{ status?: string }, unknown> = {
	// This route serves self-service callers and Settings reviewers. The route
	// gate proves an authenticated identity; listDeletionRequests applies the
	// stronger organization.reviewDeletionRequests policy before returning
	// org-wide rows for admins and owners.
	policyAction: POLICY_ACTION_CATALOG.identity.listOwnDeletionRequests,
	parseInput: (event: RequestEvent) => ({
		status: event.url.searchParams.get('status') ?? undefined
	}),
	fn: (ctx, input) => listDeletionRequests(ctx, input.status ? { status: input.status } : undefined)
};

export const GET = handle(_getConfig);

export const _postConfig: RouteConfig<CreateDeletionRequestInput, unknown> = {
	policyAction: POLICY_ACTION_CATALOG.identity.createOwnDeletionRequest,
	mutation: true,

	parseInput: async (event: RequestEvent) => {
		const body = await event.request.json();
		return {
			...body,
			userEmail: event.locals.user?.email ?? 'unknown'
		};
	},
	fn: (ctx, input) => createDeletionRequest(ctx, input),
	formatOutput: (result) => json(result, { status: 201 })
};

export const POST = handle(_postConfig);

export const _deleteConfig: RouteConfig<Record<string, unknown>, unknown> = {
	policyAction: POLICY_ACTION_CATALOG.identity.cancelOwnDeletionRequest,
	mutation: true,

	fn: async (ctx, input) => {
		if (!input || typeof input !== 'object' || Array.isArray(input)) {
			fail(400, 'Missing id');
		}

		const id = input.id;
		if (typeof id !== 'string' || id.length === 0) fail(400, 'Missing id');

		await cancelDeletionRequest(ctx, id);
		return { success: true };
	}
};

export const DELETE = handle(_deleteConfig);
