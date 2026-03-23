import { json, error } from '@sveltejs/kit';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import { createAvailabilityBatch, deleteAvailabilityBatch } from '$lib/server/core/useCases/availabilityBatch';

export const POST = async (event: import('@sveltejs/kit').RequestEvent) => {
	const ctx = await buildContext(event);
	const body = await event.request.json();

	try {
		const result = await createAvailabilityBatch(ctx, body);
		return json(result);
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		throw error(500, 'Internal server error');
	}
};

export const DELETE = async (event: import('@sveltejs/kit').RequestEvent) => {
	const ctx = await buildContext(event);
	const body = await event.request.json();

	try {
		const result = await deleteAvailabilityBatch(ctx, body);
		return json(result);
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		throw error(500, 'Internal server error');
	}
};
