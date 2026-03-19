import { json, error } from '@sveltejs/kit';
import { apiRoute } from '$lib/server/apiRoute';

export const PUT = apiRoute({ permission: { edit: 'calendar' } }, async ({ supabase, orgId }, event) => {
	const body = await event.request.json();
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
});
