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
		.from('development_goals')
		.insert({
			organization_id: orgId,
			personnel_id: body.personnelId,
			title: body.title,
			description: body.description ?? null,
			category: body.category ?? 'career',
			priority: body.priority ?? 'medium',
			status: body.status ?? 'not-started',
			target_date: body.targetDate ?? null,
			progress_notes: body.progressNotes ?? null
		})
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	return json({
		id: data.id,
		personnelId: data.personnel_id,
		title: data.title,
		description: data.description,
		category: data.category,
		priority: data.priority,
		status: data.status,
		targetDate: data.target_date,
		progressNotes: data.progress_notes
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
	if (fields.title !== undefined) updates.title = fields.title;
	if (fields.description !== undefined) updates.description = fields.description;
	if (fields.category !== undefined) updates.category = fields.category;
	if (fields.priority !== undefined) updates.priority = fields.priority;
	if (fields.status !== undefined) updates.status = fields.status;
	if (fields.targetDate !== undefined) updates.target_date = fields.targetDate;
	if (fields.progressNotes !== undefined) updates.progress_notes = fields.progressNotes;

	const { data, error: dbError } = await supabase
		.from('development_goals')
		.update(updates)
		.eq('id', id)
		.eq('organization_id', orgId)
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	return json({
		id: data.id,
		personnelId: data.personnel_id,
		title: data.title,
		description: data.description,
		category: data.category,
		priority: data.priority,
		status: data.status,
		targetDate: data.target_date,
		progressNotes: data.progress_notes
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

	const { error: dbError } = await supabase
		.from('development_goals')
		.delete()
		.eq('id', id)
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	return json({ success: true });
};
