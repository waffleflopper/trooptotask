import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const { clinicId } = params;
	const body = await request.json();

	const { data, error: dbError } = await locals.supabase
		.from('training_types')
		.insert({
			clinic_id: clinicId,
			name: body.name,
			description: body.description ?? null,
			expiration_months: body.expirationMonths ?? null,
			warning_days_yellow: body.warningDaysYellow ?? 60,
			warning_days_orange: body.warningDaysOrange ?? 30,
			required_for_roles: body.requiredForRoles ?? [],
			color: body.color ?? '#6b7280',
			sort_order: body.sortOrder ?? 0
		})
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	return json({
		id: data.id,
		name: data.name,
		description: data.description,
		expirationMonths: data.expiration_months,
		warningDaysYellow: data.warning_days_yellow,
		warningDaysOrange: data.warning_days_orange,
		requiredForRoles: data.required_for_roles,
		color: data.color,
		sortOrder: data.sort_order
	});
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const { clinicId } = params;
	const body = await request.json();
	const { id, ...fields } = body;

	if (!id) throw error(400, 'Missing id');

	const updates: Record<string, unknown> = {};
	if (fields.name !== undefined) updates.name = fields.name;
	if (fields.description !== undefined) updates.description = fields.description;
	if (fields.expirationMonths !== undefined) updates.expiration_months = fields.expirationMonths;
	if (fields.warningDaysYellow !== undefined) updates.warning_days_yellow = fields.warningDaysYellow;
	if (fields.warningDaysOrange !== undefined) updates.warning_days_orange = fields.warningDaysOrange;
	if (fields.requiredForRoles !== undefined) updates.required_for_roles = fields.requiredForRoles;
	if (fields.color !== undefined) updates.color = fields.color;
	if (fields.sortOrder !== undefined) updates.sort_order = fields.sortOrder;

	const { data, error: dbError } = await locals.supabase
		.from('training_types')
		.update(updates)
		.eq('id', id)
		.eq('clinic_id', clinicId)
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	return json({
		id: data.id,
		name: data.name,
		description: data.description,
		expirationMonths: data.expiration_months,
		warningDaysYellow: data.warning_days_yellow,
		warningDaysOrange: data.warning_days_orange,
		requiredForRoles: data.required_for_roles,
		color: data.color,
		sortOrder: data.sort_order
	});
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const { clinicId } = params;
	const body = await request.json();
	const { id } = body;

	if (!id) throw error(400, 'Missing id');

	// Cascade: delete personnel trainings with this type (DB constraint will handle this, but explicit is clearer)
	await locals.supabase
		.from('personnel_trainings')
		.delete()
		.eq('training_type_id', id)
		.eq('clinic_id', clinicId);

	const { error: dbError } = await locals.supabase
		.from('training_types')
		.delete()
		.eq('id', id)
		.eq('clinic_id', clinicId);

	if (dbError) throw error(500, dbError.message);

	return json({ success: true });
};
