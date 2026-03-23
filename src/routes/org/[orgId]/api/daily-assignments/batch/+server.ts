import { json, error } from '@sveltejs/kit';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import { clearDailyAssignment, createDailyAssignment } from '$lib/server/core/useCases/dailyAssignments';

interface BatchAssignmentRecord {
	date: string;
	assignmentTypeId: string;
	assigneeId: string; // empty string = clear
}

export const POST = async (event: import('@sveltejs/kit').RequestEvent) => {
	const ctx = await buildContext(event);
	const body = await event.request.json();
	const records: BatchAssignmentRecord[] = body.records;

	if (!Array.isArray(records) || records.length === 0) {
		throw error(400, 'records array is required');
	}

	if (records.length > 1000) {
		throw error(400, 'Maximum 1000 records per batch');
	}

	const upserts = records.filter((r) => r.assigneeId);
	const clears = records.filter((r) => !r.assigneeId);

	// Clear all affected slots first
	for (const rec of records) {
		await clearDailyAssignment(ctx, { date: rec.date, assignmentTypeId: rec.assignmentTypeId });
	}

	// Insert all upserts
	const inserted: unknown[] = [];
	for (const rec of upserts) {
		const result = await createDailyAssignment(ctx, { ...rec });
		inserted.push(result);
	}

	return json({ inserted, cleared: clears.length });
};
