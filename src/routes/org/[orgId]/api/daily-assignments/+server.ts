import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditPermission } from '$lib/server/permissions';
import { getApiContext } from '$lib/server/supabase';
import { checkReadOnly } from '$lib/server/read-only-guard';

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'calendar');
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const body = await request.json();

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
};

export const DELETE: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'calendar');
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const body = await request.json();

	const { error: dbError } = await supabase
		.from('daily_assignments')
		.delete()
		.eq('organization_id', orgId)
		.eq('assignment_type_id', body.assignmentTypeId)
		.eq('date', body.date);

	if (dbError) throw error(500, dbError.message);

	return json({ success: true });
};
