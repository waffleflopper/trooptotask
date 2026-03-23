import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import {
	listDeletionRequests,
	createDeletionRequest,
	cancelDeletionRequest
} from '$lib/server/core/useCases/deletionRequests';

function rethrowOrWrap(err: unknown): never {
	if (err && typeof err === 'object' && 'status' in err) throw err;
	throw error(500, 'Internal server error');
}

export const GET = async (event: RequestEvent) => {
	try {
		const ctx = await buildContext(event);
		const status = event.url.searchParams.get('status');
		const data = await listDeletionRequests(ctx, status ? { status } : undefined);
		return json(data);
	} catch (err) {
		rethrowOrWrap(err);
	}
};

export const POST = async (event: RequestEvent) => {
	try {
		const ctx = await buildContext(event);
		const body = await event.request.json();
		const userEmail = event.locals.user?.email ?? 'unknown';

		const data = await createDeletionRequest(ctx, {
			resourceType: body.resourceType,
			resourceId: body.resourceId,
			resourceDescription: body.resourceDescription,
			resourceUrl: body.resourceUrl,
			userEmail
		});

		return json(data, { status: 201 });
	} catch (err) {
		rethrowOrWrap(err);
	}
};

export const DELETE = async (event: RequestEvent) => {
	try {
		const ctx = await buildContext(event);
		const body = await event.request.json();
		await cancelDeletionRequest(ctx, body.id);
		return json({ success: true });
	} catch (err) {
		rethrowOrWrap(err);
	}
};
