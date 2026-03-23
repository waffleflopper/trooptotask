import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import { getApiContext } from '$lib/server/supabase';

export const PUT = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const orgId = event.params.orgId as string;
	const { supabase } = getApiContext(event.locals, event.cookies, orgId);

	ctx.auth.requireEdit('calendar');

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) throw error(403, 'Organization is in read-only mode');

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

	ctx.audit.log({
		action: 'duty_roster_exemption.updated',
		resourceType: 'duty_roster_exemption',
		resourceId: assignmentTypeId
	});
	return json({ exemptPersonnelIds: data.exempt_personnel_ids });
};
