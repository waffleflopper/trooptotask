import { json } from '@sveltejs/kit';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { handle, createRequestDeletionRequestCancellation, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import {
	createDeletionRequest,
	cancelDeletionRequest,
	type CreateDeletionRequestInput,
	type DeletionRequestCancellationPort
} from '$features/deletion-requests/index.server';
import { listDeletionRequests } from '$lib/server/core/useCases/deletionRequests';

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

export function _createDeleteConfig(
	cancellation: DeletionRequestCancellationPort
): RouteConfig<Record<string, unknown>, { success: true }> {
	return {
		policyAction: POLICY_ACTION_CATALOG.identity.cancelOwnDeletionRequest,
		mutation: true,

		fn: async (ctx, input) => {
			if (!input || typeof input !== 'object' || Array.isArray(input)) {
				fail(400, 'Missing id');
			}

			const id = input.id;
			if (typeof id !== 'string' || id.length === 0) fail(400, 'Missing id');

			await cancelDeletionRequest({ auth: ctx.auth, audit: ctx.audit, store: ctx.store, cancellation }, id);
			return { success: true };
		}
	};
}

export const DELETE: RequestHandler = (event) =>
	handle(_createDeleteConfig(createRequestDeletionRequestCancellation(event.locals)))(event);
