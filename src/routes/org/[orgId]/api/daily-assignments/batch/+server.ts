import { json, error } from '@sveltejs/kit';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import { batchDailyAssignments } from '$lib/server/core/useCases/dailyAssignmentsBatch';

export const POST = async (event: import('@sveltejs/kit').RequestEvent) => {
	try {
		const ctx = await buildContext(event);

		let body: Record<string, unknown>;
		try {
			body = (await event.request.json()) as Record<string, unknown>;
		} catch {
			throw error(400, 'Invalid JSON in request body');
		}

		const result = await batchDailyAssignments(ctx, {
			records: body.records as Array<{ date: string; assignmentTypeId: string; assigneeId: string }>
		});
		return json(result);
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		throw error(500, 'Internal server error');
	}
};
