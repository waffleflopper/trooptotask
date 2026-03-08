import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditPermission } from '$lib/server/permissions';
import { getApiContext } from '$lib/server/supabase';
import { checkReadOnly } from '$lib/server/read-only-guard';

export const PUT: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'calendar');
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const body = await request.json();
	const { assignmentTypeId, personnelIds } = body as {
		assignmentTypeId: string;
		personnelIds: string[];
	};

	if (!assignmentTypeId) throw error(400, 'Missing assignmentTypeId');

	const { data, error: dbError } = await supabase
		.from('assignment_types')
		.update({ exempt_personnel_ids: personnelIds ?? [] })
		.eq('id', assignmentTypeId)
		.eq('organization_id', orgId)
		.select('exempt_personnel_ids')
		.single();

	if (dbError) throw error(500, dbError.message);

	return json({ exemptPersonnelIds: data.exempt_personnel_ids });
};
