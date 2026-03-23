import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import { getApiContext } from '$lib/server/supabase';

export const POST = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const orgId = event.params.orgId as string;
	const { supabase } = getApiContext(event.locals, event.cookies, orgId);

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) throw error(403, 'Organization is in read-only mode');

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

	ctx.audit.log({ action: 'unit.created', resourceType: 'unit', resourceId: data.id });

	return json({
		id: data.id,
		name: data.name,
		sortOrder: data.sort_order
	});
};

export const PUT = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const orgId = event.params.orgId as string;
	const { supabase } = getApiContext(event.locals, event.cookies, orgId);

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) throw error(403, 'Organization is in read-only mode');

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

	ctx.audit.log({ action: 'unit.updated', resourceType: 'unit', resourceId: id });

	return json({
		id: data.id,
		name: data.name,
		sortOrder: data.sort_order
	});
};

export const DELETE = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const orgId = event.params.orgId as string;
	const { supabase } = getApiContext(event.locals, event.cookies, orgId);

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) throw error(403, 'Organization is in read-only mode');

	const body = await event.request.json();
	const { id } = body;

	if (!id) throw error(400, 'Missing id');

	const { error: dbError } = await supabase.from('units').delete().eq('id', id).eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	ctx.audit.log({ action: 'unit.deleted', resourceType: 'unit', resourceId: id });

	return json({ success: true });
};
