import { json, error } from '@sveltejs/kit';
import { apiRoute } from '$lib/server/apiRoute';

export const POST = apiRoute({ permission: { edit: 'calendar' } }, async ({ supabase, orgId }, event) => {
	const body = await event.request.json();

	// Upsert: delete existing then insert (using the unique constraint)
	await supabase
		.from('daily_assignments')
		.delete()
		.eq('organization_id', orgId)
		.eq('assignment_type_id', body.assignmentTypeId)
		.eq('date', body.date);

	if (body.assigneeId) {
		const { data, error: dbError } = await supabase
			.from('daily_assignments')
			.insert({
				organization_id: orgId,
				assignment_type_id: body.assignmentTypeId,
				date: body.date,
				assignee_id: body.assigneeId
			})
			.select()
			.single();

		if (dbError) throw error(500, dbError.message);

		return json({
			id: data.id,
			date: data.date,
			assignmentTypeId: data.assignment_type_id,
			assigneeId: data.assignee_id
		});
	}

	return json({ success: true, removed: true });
});

export const DELETE = apiRoute({ permission: { edit: 'calendar' } }, async ({ supabase, orgId }, event) => {
	const body = await event.request.json();

	const { error: dbError } = await supabase
		.from('daily_assignments')
		.delete()
		.eq('organization_id', orgId)
		.eq('assignment_type_id', body.assignmentTypeId)
		.eq('date', body.date);

	if (dbError) throw error(500, dbError.message);

	return json({ success: true });
});
