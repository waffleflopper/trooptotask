import { json, error } from '@sveltejs/kit';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import { importTrainingRecords } from '$lib/server/core/useCases/trainingRecordsBatch';

export const POST = async (event: import('@sveltejs/kit').RequestEvent) => {
	const ctx = await buildContext(event);
	const body = await event.request.json();

	try {
		const result = await importTrainingRecords(ctx, body);
		return json(result);
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		throw error(500, 'Internal server error');
	}
};
