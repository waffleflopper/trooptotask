import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';
import { approveDeletionRequest, denyDeletionRequest } from '$lib/server/core/useCases/deletionRequests';
import { getAdminClient } from '$lib/server/supabase';
import {
	createSupabaseApprovedTrainingTypeDeletionPort,
	type ApprovedTrainingTypeDeletionPort
} from '$features/training/index.server';

export function _reviewPostConfig(
	trainingTypeDeletion: ApprovedTrainingTypeDeletionPort
): RouteConfig<Record<string, unknown>, unknown> {
	return {
		// Keep the use-case governance check as defense in depth because approve/deny
		// remain callable service functions outside this HTTP route.
		policyAction: POLICY_ACTION_CATALOG.organization.reviewDeletionRequests,
		mutation: true,
		fn: async (ctx, input) => {
			const { id, action, denialReason } = input;

			if (!id || !action) fail(400, 'Missing required fields: id, action');
			if (action !== 'approve' && action !== 'deny') {
				fail(400, 'Action must be "approve" or "deny"');
			}

			if (action === 'approve') {
				await approveDeletionRequest(ctx, id as string, trainingTypeDeletion);
			} else {
				await denyDeletionRequest(ctx, id as string, denialReason as string | undefined);
			}

			return { success: true };
		}
	};
}

export const _postConfig = _reviewPostConfig(createSupabaseApprovedTrainingTypeDeletionPort(getAdminClient));

export const POST = handle(_postConfig);
