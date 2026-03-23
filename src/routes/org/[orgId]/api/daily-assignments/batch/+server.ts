import { json, error } from '@sveltejs/kit';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import { batchDailyAssignments } from '$lib/server/core/useCases/dailyAssignmentsBatch';

export const POST = async (event: import('@sveltejs/kit').RequestEvent) => {
	const ctx = await buildContext(event);
	const body = await event.request.json();

	try {
		const result = await batchDailyAssignments(ctx, { records: body.records });
		return json(result);
	} catch (err) {
		const status = (err as Record<string, unknown>).status;
		if (typeof status === 'number') {
			throw error(status, (err as Error).message);
		}
		throw err;
	}
};
