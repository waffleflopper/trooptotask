import { json, error } from '@sveltejs/kit';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import { createDailyAssignment, clearDailyAssignment } from '$lib/server/core/useCases/dailyAssignments';

export const POST = async (event: import('@sveltejs/kit').RequestEvent) => {
	const ctx = await buildContext(event);
	const body = await event.request.json();

	// Clear existing slot first (upsert pattern)
	await clearDailyAssignment(ctx, { date: body.date, assignmentTypeId: body.assignmentTypeId });

	if (body.assigneeId) {
		const result = await createDailyAssignment(ctx, body);
		return json(result);
	}

	return json({ success: true, removed: true });
};

export const DELETE = async (event: import('@sveltejs/kit').RequestEvent) => {
	const ctx = await buildContext(event);
	const body = await event.request.json();

	await clearDailyAssignment(ctx, { date: body.date, assignmentTypeId: body.assignmentTypeId });

	return json({ success: true });
};
