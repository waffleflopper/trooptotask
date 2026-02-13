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
		.from('assignment_types')
		.insert({
			organization_id: orgId,
			name: body.name,
			short_name: body.shortName,
			assign_to: body.assignTo,
			color: body.color ?? '#6b7280',
			sort_order: body.sortOrder ?? 0
		})
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	return json({
		id: data.id,
		name: data.name,
		shortName: data.short_name,
		assignTo: data.assign_to,
		color: data.color
	});
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const { orgId } = params;
	await requireEditPermission(locals.supabase, orgId, user.id, 'calendar');

	const body = await request.json();
	const { id, ...fields } = body;

	if (!id) throw error(400, 'Missing id');

	const updates: Record<string, unknown> = {};
	if (fields.name !== undefined) updates.name = fields.name;
	if (fields.shortName !== undefined) updates.short_name = fields.shortName;
	if (fields.assignTo !== undefined) updates.assign_to = fields.assignTo;
	if (fields.color !== undefined) updates.color = fields.color;
	if (fields.sortOrder !== undefined) updates.sort_order = fields.sortOrder;

	const { data, error: dbError } = await locals.supabase
		.from('assignment_types')
		.update(updates)
		.eq('id', id)
		.eq('organization_id', orgId)
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	return json({
		id: data.id,
		name: data.name,
		shortName: data.short_name,
		assignTo: data.assign_to,
		color: data.color
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
		.from('assignment_types')
		.delete()
		.eq('id', id)
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	return json({ success: true });
};
