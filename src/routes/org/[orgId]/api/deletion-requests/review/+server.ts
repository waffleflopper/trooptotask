import { handle } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { approveDeletionRequest, denyDeletionRequest } from '$lib/server/core/useCases/deletionRequests';

export const POST = handle<Record<string, unknown>, unknown>({
	permission: 'privileged',
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
});
