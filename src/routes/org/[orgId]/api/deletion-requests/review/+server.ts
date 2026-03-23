import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import { approveDeletionRequest, denyDeletionRequest } from '$lib/server/core/useCases/deletionRequests';

export const POST = async (event: RequestEvent) => {
	try {
		const ctx = await buildContext(event);
		const body = await event.request.json();
		const { id, action, denialReason } = body;

		if (!id || !action) throw error(400, 'Missing required fields: id, action');
		if (action !== 'approve' && action !== 'deny') {
			throw error(400, 'Action must be "approve" or "deny"');
		}

		if (action === 'approve') {
			await approveDeletionRequest(ctx, id);
		} else {
			await denyDeletionRequest(ctx, id, denialReason);
		}

		return json({ success: true });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		throw error(500, 'Internal server error');
	}
};
