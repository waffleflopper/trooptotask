import { json, error } from '@sveltejs/kit';
import { apiRoute } from '$lib/server/apiRoute';
import { DailyAssignmentEntity } from '$lib/server/entities/dailyAssignment';

export const POST = apiRoute(
	{ permission: { edit: 'calendar' }, audit: 'daily_assignment' },
	async (routeCtx, event) => {
		const { supabase, orgId } = routeCtx;
		const body = await event.request.json();

		// Upsert: delete existing then insert (using the unique constraint)
		await supabase
			.from('daily_assignments')
			.delete()
			.eq('organization_id', orgId)
			.eq('assignment_type_id', body.assignmentTypeId)
			.eq('date', body.date);

		if (body.assigneeId) {
			const insertData = DailyAssignmentEntity.toDbInsert(body, orgId);

			const { data, error: dbError } = await supabase.from('daily_assignments').insert(insertData).select().single();

			if (dbError) throw error(500, dbError.message);

			return json(DailyAssignmentEntity.fromDb(data as Record<string, unknown>));
		}

		routeCtx.audit('daily_assignment.removed', { date: body.date, assignmentTypeId: body.assignmentTypeId });
		return json({ success: true, removed: true });
	}
);

export const DELETE = apiRoute(
	{ permission: { edit: 'calendar' }, audit: 'daily_assignment' },
	async ({ supabase, orgId }, event) => {
		const body = await event.request.json();

		const { error: dbError } = await supabase
			.from('daily_assignments')
			.delete()
			.eq('organization_id', orgId)
			.eq('assignment_type_id', body.assignmentTypeId)
			.eq('date', body.date);

		if (dbError) throw error(500, dbError.message);

		return json({ success: true });
	}
);
