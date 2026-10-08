import {
	cancelDeletionRequest,
	createDeletionRequest,
	listDeletionRequests,
	type CreateDeletionRequestInput,
	type DeletionRequestCancellationPort,
	type DeletionRequestStore
} from '$features/deletion-requests/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import {
	createRequestDeletionRequestCancellation,
	createRequestDeletionRequestStore,
	handle,
	type RouteConfig
} from '$lib/server/adapters/httpAdapter';
import {
	createRequestNotificationContext,
	createRequestActorContext
} from '$lib/server/adapters/requestContexts.server';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

export function _createGetConfig(
	store: DeletionRequestStore
): RouteConfig<{ status?: string }, unknown, ReturnType<typeof createRequestActorContext>> {
	return {
		context: createRequestActorContext,
		policyAction: POLICY_ACTION_CATALOG.identity.listOwnDeletionRequests,
		parseInput: (event: RequestEvent) => ({ status: event.url.searchParams.get('status') ?? undefined }),
		fn: (ctx, input) =>
			listDeletionRequests(
				{ auth: ctx.auth, audit: ctx.audit, store },
				input.status ? { status: input.status } : undefined
			)
	};
}

export function _createPostConfig(
	store: DeletionRequestStore
): RouteConfig<CreateDeletionRequestInput, unknown, ReturnType<typeof createRequestNotificationContext>> {
	return {
		context: createRequestNotificationContext,
		policyAction: POLICY_ACTION_CATALOG.identity.createOwnDeletionRequest,
		mutation: true,
		parseInput: async (event: RequestEvent) => ({
			...(await event.request.json()),
			userEmail: event.locals.user?.email ?? 'unknown'
		}),
		fn: (ctx, input) =>
			createDeletionRequest({ auth: ctx.auth, audit: ctx.audit, store, notifications: ctx.notifications }, input),
		formatOutput: (result) => json(result, { status: 201 })
	};
}

export function _createDeleteConfig(
	store: DeletionRequestStore,
	cancellation: DeletionRequestCancellationPort
): RouteConfig<Record<string, unknown>, { success: true }, ReturnType<typeof createRequestActorContext>> {
	return {
		context: createRequestActorContext,
		policyAction: POLICY_ACTION_CATALOG.identity.cancelOwnDeletionRequest,
		mutation: true,
		fn: async (ctx, input) => {
			if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Missing id');
			const id = input.id;
			if (typeof id !== 'string' || id.length === 0) fail(400, 'Missing id');
			await cancelDeletionRequest({ auth: ctx.auth, audit: ctx.audit, store, cancellation }, id);
			return { success: true };
		}
	};
}

export const GET: RequestHandler = (event) =>
	handle(_createGetConfig(createRequestDeletionRequestStore(event.locals)))(event);
export const POST: RequestHandler = (event) =>
	handle(_createPostConfig(createRequestDeletionRequestStore(event.locals)))(event);
export const DELETE: RequestHandler = (event) =>
	handle(
		_createDeleteConfig(
			createRequestDeletionRequestStore(event.locals),
			createRequestDeletionRequestCancellation(event.locals)
		)
	)(event);
