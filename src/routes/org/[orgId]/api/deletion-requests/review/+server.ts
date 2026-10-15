import type { DeletionRequestResourceType } from '$features/deletion-requests/contracts';
import {
	approveDeletionRequest,
	denyDeletionRequest,
	requirePendingDeletionRequest,
	type ApprovedDeletionEffects,
	type DeletionRequestStore
} from '$features/deletion-requests/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import { isUuid } from '$lib/utils/inputSchemas';
import { createRequestDeletionRequestStore, handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import {
	createApprovedDeletionEffects,
	createRequestDeletionReviewContext
} from '$lib/server/adapters/requestContexts.server';
import type { RequestHandler } from '@sveltejs/kit';

export function _reviewPostConfig(
	store: DeletionRequestStore,
	effectsFor: (ctx: ReturnType<typeof createRequestDeletionReviewContext>) => ApprovedDeletionEffects
): RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestDeletionReviewContext>> {
	return {
		context: createRequestDeletionReviewContext,
		policyAction: POLICY_ACTION_CATALOG.organization.reviewDeletionRequests,
		mutation: true,
		fn: async (ctx, input) => {
			const { id, action, denialReason } = input;
			if (!id || !action) fail(400, 'Missing required fields: id, action');
			if (!isUuid(id)) fail(400, 'Invalid ID');
			if (action !== 'approve' && action !== 'deny') fail(400, 'Action must be "approve" or "deny"');
			if (denialReason != null && typeof denialReason !== 'string') fail(400, 'Denial reason must be text');
			const review = { auth: ctx.auth, audit: ctx.audit, store, notifications: ctx.notifications };
			if (action === 'approve')
				return { success: true, ...(await approveDeletionRequest(review, id, effectsFor(ctx))) };
			await denyDeletionRequest(review, id, denialReason ?? undefined);
			return { success: true };
		}
	};
}

export const POST: RequestHandler = (event) => {
	const store = createRequestDeletionRequestStore(event.locals);
	const requirePending = (
		orgId: string,
		requestId: string,
		resourceType: DeletionRequestResourceType,
		resourceId: string
	) => requirePendingDeletionRequest(store, orgId, requestId, resourceType, resourceId);
	return handle(_reviewPostConfig(store, (ctx) => createApprovedDeletionEffects(ctx, requirePending)))(event);
};
