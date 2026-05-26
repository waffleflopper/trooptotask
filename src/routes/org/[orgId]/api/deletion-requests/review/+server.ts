import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';
import { approveDeletionRequest, denyDeletionRequest } from '$lib/server/core/useCases/deletionRequests';

export const _postConfig: RouteConfig<Record<string, unknown>, unknown> = {
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
			await approveDeletionRequest(ctx, id as string);
		} else {
			await denyDeletionRequest(ctx, id as string, denialReason as string | undefined);
		}

		return { success: true };
	}
};

export const POST = handle(_postConfig);
