import type { RequestHandler } from './$types';
import { RequestFailure } from '$lib/errors';
import { error, json } from '@sveltejs/kit';
import { createPlatformSuspensionOperations } from '$features/platform-admin/index.server';

export const POST: RequestHandler = async (event) => {
	const operations = await createPlatformSuspensionOperations(event);
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON in request body');
	}
	let result;
	try {
		result = await operations.updateSuspension(body);
	} catch (cause) {
		if (cause instanceof RequestFailure && cause.status === 403)
			return json(
				{
					message: cause.message,
					reason: cause.reason,
					requiresStepUp: cause.requiresStepUp,
					stepUpPath: cause.stepUpPath
				},
				{ status: 403 }
			);
		error(500, 'Could not confirm the suspension change. Reload details before trying again.');
	}
	if (result.status === 'invalid_input') error(400, result.message);
	return json({ success: true, alreadySuspended: result.status === 'already_suspended' });
};
