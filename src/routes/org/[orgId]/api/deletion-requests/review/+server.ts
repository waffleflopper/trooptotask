import type { DeletionRequestResourceType } from '$features/deletion-requests/contracts';
import {
	approveDeletionRequest,
	denyDeletionRequest,
	requirePendingDeletionRequest,
	type ApprovedDeletionEffects,
	type DeletionRequestStore
} from '$features/deletion-requests/index.server';
import {
	archiveApprovedPersonnelRecord,
	createSupabasePersonnelGovernanceDeletionPort
} from '$features/personnel/index.server';
import { createApprovedRatingSchemeDeletionPort } from '$features/rating-scheme/index.server';
import { createSupabaseApprovedTrainingDeletionPort } from '$features/training/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import { createRequestDeletionRequestStore, handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestDeletionReviewContext } from '$lib/server/adapters/requestContexts.server';
import { getAdminClient } from '$lib/server/supabase';
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
			if (action !== 'approve' && action !== 'deny') fail(400, 'Action must be "approve" or "deny"');
			const review = { auth: ctx.auth, audit: ctx.audit, store, notifications: ctx.notifications };
			if (action === 'approve') await approveDeletionRequest(review, id as string, effectsFor(ctx));
			else await denyDeletionRequest(review, id as string, denialReason as string | undefined);
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
	return handle(
		_reviewPostConfig(store, (ctx) => {
			const training = createSupabaseApprovedTrainingDeletionPort(getAdminClient, requirePending);
			const rating = createApprovedRatingSchemeDeletionPort(ctx.ratingScheme, requirePending);
			const counseling = createSupabasePersonnelGovernanceDeletionPort(getAdminClient, requirePending);
			return {
				archivePersonnel: (id) => archiveApprovedPersonnelRecord(ctx, id),
				deleteTrainingType: (requestId, id) => training.deleteApprovedTrainingType(ctx.auth, requestId, id),
				deleteTrainingRecord: (requestId, id) => training.deleteApprovedTrainingRecord(ctx.auth, requestId, id),
				deleteRatingEntry: (requestId, id) => rating.deleteApprovedRatingSchemeEntry(ctx.auth, requestId, id),
				approveCounseling: (requestId, id, reviewedAt) =>
					counseling.deleteApprovedCounselingRecord(ctx.auth, requestId, id, reviewedAt)
			};
		})
	)(event);
};
