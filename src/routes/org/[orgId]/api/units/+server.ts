import { json, error } from '@sveltejs/kit';
import { apiRoute } from '$lib/server/apiRoute';

export const POST = apiRoute({ permission: { none: true } }, async ({ supabase, orgId }, event) => {
	const body = await event.request.json();

	const { data, error: dbError } = await supabase
		.from('units')
		.insert({
			organization_id: orgId,
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
});

export const PUT = apiRoute({ permission: { none: true } }, async ({ supabase, orgId }, event) => {
	const body = await event.request.json();
	const { id, ...fields } = body;

	if (!id) throw error(400, 'Missing id');

	const updates: Record<string, unknown> = {};
	if (fields.name !== undefined) updates.name = fields.name;
	if (fields.sortOrder !== undefined) updates.sort_order = fields.sortOrder;

	const { data, error: dbError } = await supabase
		.from('units')
		.update(updates)
		.eq('id', id)
		.eq('organization_id', orgId)
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	return json({
		id: data.id,
		name: data.name,
		sortOrder: data.sort_order
	});
});

export const DELETE = apiRoute({ permission: { none: true } }, async ({ supabase, orgId }, event) => {
	const body = await event.request.json();
	const { id } = body;

	if (!id) throw error(400, 'Missing id');

	const { error: dbError } = await supabase.from('units').delete().eq('id', id).eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	return json({ success: true });
});
