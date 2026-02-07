import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const { clinicId } = params;
	const body = await request.json();

	// Upsert: delete existing then insert (using the unique constraint)
	await locals.supabase
		.from('daily_assignments')
		.delete()
		.eq('clinic_id', clinicId)
		.eq('assignment_type_id', body.assignmentTypeId)
		.eq('date', body.date);

	if (body.assigneeId) {
		const { data, error: dbError } = await locals.supabase
			.from('daily_assignments')
			.insert({
				clinic_id: clinicId,
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
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const { clinicId } = params;
	const body = await request.json();

	const { error: dbError } = await locals.supabase
		.from('daily_assignments')
		.delete()
		.eq('clinic_id', clinicId)
		.eq('assignment_type_id', body.assignmentTypeId)
		.eq('date', body.date);

	if (dbError) throw error(500, dbError.message);

	return json({ success: true });
};
