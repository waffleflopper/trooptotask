import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditPermission } from '$lib/server/permissions';
import { getApiContext } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ params, locals, cookies }) => {
	const { orgId } = params;
	const { supabase } = getApiContext(locals, cookies, orgId);

	const { data, error: dbError } = await supabase
		.from('duty_roster_history')
		.select('*')
		.eq('organization_id', orgId)
		.order('created_at', { ascending: false });

	if (dbError) throw error(500, dbError.message);

	return json(
		(data ?? []).map((r: any) => ({
			id: r.id,
			assignmentTypeId: r.assignment_type_id,
			name: r.name,
			startDate: r.start_date,
			endDate: r.end_date,
			roster: r.roster,
			config: r.config,
			createdAt: r.created_at
		}))
	);
};

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'calendar');
	}

	const body = await request.json();

	const { data, error: dbError } = await supabase
		.from('duty_roster_history')
		.insert({
			organization_id: orgId,
			assignment_type_id: body.assignmentTypeId,
			name: body.name,
			start_date: body.startDate,
			end_date: body.endDate,
			roster: body.roster,
			config: body.config ?? null,
			created_by_user_id: userId ?? null
		})
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	return json({
		id: data.id,
		assignmentTypeId: data.assignment_type_id,
		name: data.name,
		startDate: data.start_date,
		endDate: data.end_date,
		roster: data.roster,
		config: data.config,
		createdAt: data.created_at
	});
};
