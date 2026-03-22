import { json, error } from '@sveltejs/kit';
import { postHandler, putHandler, buildContext } from '$lib/server/adapters/httpAdapter';
import { validateUUID } from '$lib/server/validation';
import { createRatingSchemeEntryUseCases } from '$lib/server/core/useCases/ratingSchemeEntryCrud';

const useCases = createRatingSchemeEntryUseCases();

export const POST = postHandler(useCases.create);
export const PUT = putHandler(useCases.update);

export const DELETE = async (event: import('@sveltejs/kit').RequestEvent) => {
	const ctx = await buildContext(event);

	let body: Record<string, unknown>;
	try {
		body = (await event.request.json()) as Record<string, unknown>;
	} catch {
		throw error(400, 'Invalid JSON in request body');
	}

	const id = body.id;
	if (!id || typeof id !== 'string') {
		throw error(400, 'Missing id');
	}
	if (!validateUUID(id)) {
		throw error(400, 'Invalid resource ID');
	}

	try {
		const result = await useCases.remove(ctx, id);
		if (result?.requiresApproval) {
			return json({ requiresApproval: true }, { status: 202 });
		}
		return json({ success: true });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		throw error(500, 'Internal server error');
	}
};
