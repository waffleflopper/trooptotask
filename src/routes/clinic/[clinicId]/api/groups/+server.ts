import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditPermission } from '$lib/server/permissions';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const { clinicId } = params;
	await requireEditPermission(locals.supabase, clinicId, user.id, 'personnel');

	const body = await request.json();

	const { data, error: dbError } = await locals.supabase
		.from('groups')
		.insert({
			clinic_id: clinicId,
			name: body.name,
			sort_order: body.sortOrder ?? 0
		})
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	return json({
		id: data.id,
		name: data.name,
		sortOrder: data.sort_order
	});
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const { clinicId } = params;
	await requireEditPermission(locals.supabase, clinicId, user.id, 'personnel');

	const body = await request.json();
	const { id, ...fields } = body;

	if (!id) throw error(400, 'Missing id');

	const updates: Record<string, unknown> = {};
	if (fields.name !== undefined) updates.name = fields.name;
	if (fields.sortOrder !== undefined) updates.sort_order = fields.sortOrder;

	const { data, error: dbError } = await locals.supabase
		.from('groups')
		.update(updates)
		.eq('id', id)
		.eq('clinic_id', clinicId)
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	return json({
		id: data.id,
		name: data.name,
		sortOrder: data.sort_order
	});
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const { clinicId } = params;
	await requireEditPermission(locals.supabase, clinicId, user.id, 'personnel');

	const body = await request.json();
	const { id } = body;

	if (!id) throw error(400, 'Missing id');

	const { error: dbError } = await locals.supabase
		.from('groups')
		.delete()
		.eq('id', id)
		.eq('clinic_id', clinicId);

	if (dbError) throw error(500, dbError.message);

	return json({ success: true });
};
