import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditPermission } from '$lib/server/permissions';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const { orgId } = params;
	await requireEditPermission(locals.supabase, orgId, user.id, 'calendar');

	const body = await request.json();

	const { data, error: dbError } = await locals.supabase
		.from('availability_entries')
		.insert({
			organization_id: orgId,
			personnel_id: body.personnelId,
			status_type_id: body.statusTypeId,
			start_date: body.startDate,
			end_date: body.endDate
		})
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	return json({
		id: data.id,
		personnelId: data.personnel_id,
		statusTypeId: data.status_type_id,
		startDate: data.start_date,
		endDate: data.end_date
	});
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const { orgId } = params;
	await requireEditPermission(locals.supabase, orgId, user.id, 'calendar');

	const body = await request.json();
	const { id } = body;

	if (!id) throw error(400, 'Missing id');

	const { error: dbError } = await locals.supabase
		.from('availability_entries')
		.delete()
		.eq('id', id)
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	return json({ success: true });
};
