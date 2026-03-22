import { json, error } from '@sveltejs/kit';
import { apiRoute } from '$lib/server/apiRoute';
import { auditLog } from '$lib/server/auditLog';
import { DailyAssignmentEntity } from '$lib/server/entities/dailyAssignment';

interface BatchAssignmentRecord {
	date: string;
	assignmentTypeId: string;
	assigneeId: string; // empty string = clear
}

export const POST = apiRoute({ permission: { edit: 'calendar' } }, async ({ supabase, orgId, userId }, event) => {
	const body = await event.request.json();
	const records: BatchAssignmentRecord[] = body.records;

	if (!Array.isArray(records) || records.length === 0) {
		throw error(400, 'records array is required');
	}

	if (records.length > 1000) {
		throw error(400, 'Maximum 1000 records per batch');
	}

	// Split into upserts (has assigneeId) and clears (empty assigneeId)
	const upserts = records.filter((r) => r.assigneeId);
	const clears = records.filter((r) => !r.assigneeId);

	// Batch delete all affected date+type combos first
	// Group by assignmentTypeId for efficient deletes
	const deleteGroups = new Map<string, string[]>();
	for (const rec of records) {
		if (!deleteGroups.has(rec.assignmentTypeId)) {
			deleteGroups.set(rec.assignmentTypeId, []);
		}
		deleteGroups.get(rec.assignmentTypeId)!.push(rec.date);
	}

	for (const [typeId, dates] of deleteGroups) {
		const { error: delError } = await supabase
			.from('daily_assignments')
			.delete()
			.eq('organization_id', orgId)
			.eq('assignment_type_id', typeId)
			.in('date', dates);

		if (delError) throw error(500, delError.message);
	}

	// Batch insert all upserts
	let insertedData: Record<string, unknown>[] = [];
	if (upserts.length > 0) {
		const rows = upserts.map((r) => ({
			organization_id: orgId,
			assignment_type_id: r.assignmentTypeId,
			date: r.date,
			assignee_id: r.assigneeId
		}));

		const { data, error: insertError } = await supabase.from('daily_assignments').insert(rows).select();

		if (insertError) throw error(500, insertError.message);
		insertedData = data ?? [];
	}

	auditLog(
		{
			action: 'daily_assignments.bulk_upserted',
			resourceType: 'daily_assignment',
			orgId,
			details: {
				actor: event.locals.user?.email ?? userId,
				upserted: insertedData.length,
				cleared: clears.length
			}
		},
		{ userId }
	);

	const result = DailyAssignmentEntity.fromDbArray(insertedData as Record<string, unknown>[]);

	return json({ inserted: result, cleared: clears.length });
});
