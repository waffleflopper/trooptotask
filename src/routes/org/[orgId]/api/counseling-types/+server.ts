import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditPermission } from '$lib/server/permissions';
import { getApiContext } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const body = await request.json();

	const { data, error: dbError } = await supabase
		.from('counseling_types')
		.insert({
			organization_id: orgId,
			name: body.name,
			description: body.description ?? null,
			template_content: body.templateContent ?? null,
			recurrence: body.recurrence ?? 'none',
			color: body.color ?? '#6b7280',
			is_freeform: body.isFreeform ?? false,
			sort_order: body.sortOrder ?? 0
		})
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	return json({
		id: data.id,
		name: data.name,
		description: data.description,
		templateContent: data.template_content,
		recurrence: data.recurrence,
		color: data.color,
		isFreeform: data.is_freeform,
		sortOrder: data.sort_order
	});
};

export const PUT: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const body = await request.json();
	const { id, ...fields } = body;

	if (!id) throw error(400, 'Missing id');

	const updates: Record<string, unknown> = {};
	if (fields.name !== undefined) updates.name = fields.name;
	if (fields.description !== undefined) updates.description = fields.description;
	if (fields.templateContent !== undefined) updates.template_content = fields.templateContent;
	if (fields.recurrence !== undefined) updates.recurrence = fields.recurrence;
	if (fields.color !== undefined) updates.color = fields.color;
	if (fields.isFreeform !== undefined) updates.is_freeform = fields.isFreeform;
	if (fields.sortOrder !== undefined) updates.sort_order = fields.sortOrder;

	const { data, error: dbError } = await supabase
		.from('counseling_types')
		.update(updates)
		.eq('id', id)
		.eq('organization_id', orgId)
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	return json({
		id: data.id,
		name: data.name,
		description: data.description,
		templateContent: data.template_content,
		recurrence: data.recurrence,
		color: data.color,
		isFreeform: data.is_freeform,
		sortOrder: data.sort_order
	});
};

export const DELETE: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const body = await request.json();
	const { id } = body;

	if (!id) throw error(400, 'Missing id');

	// Note: counseling_records with this type_id will have it set to NULL (ON DELETE SET NULL)
	const { error: dbError } = await supabase
		.from('counseling_types')
		.delete()
		.eq('id', id)
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	return json({ success: true });
};
