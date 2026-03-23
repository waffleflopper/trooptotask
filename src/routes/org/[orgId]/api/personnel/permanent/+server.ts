import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import { getApiContext } from '$lib/server/supabase';
import { notifyAdmins } from '$lib/server/notifications';

export const DELETE = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const orgId = event.params.orgId as string;
	const { supabase, isSandbox } = getApiContext(event.locals, event.cookies, orgId);

	ctx.auth.requirePrivileged();
	if (isSandbox) throw error(403, 'This action is not available in sandbox mode');

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) throw error(403, 'Organization is in read-only mode');

	const body = await event.request.json();
	const { id } = body;
	if (!id) throw error(400, 'Missing id');

	const { data: person } = await supabase
		.from('personnel')
		.select('rank, first_name, last_name, archived_at')
		.eq('id', id)
		.eq('organization_id', orgId)
		.single();

	if (!person) throw error(404, 'Personnel not found');
	if (!person.archived_at) throw error(400, 'Can only permanently delete archived personnel');

	const { error: dbError } = await supabase.from('personnel').delete().eq('id', id).eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	const personName = `${person.rank} ${person.last_name}, ${person.first_name}`;

	ctx.audit.log({
		action: 'personnel.permanently_deleted',
		resourceType: 'personnel',
		resourceId: id,
		details: {
			actor: event.locals.user?.email ?? ctx.auth.userId,
			name: personName
		}
	});

	await notifyAdmins(orgId, ctx.auth.userId, {
		type: 'personnel_permanently_deleted',
		title: 'Personnel Permanently Deleted',
		message: `"${event.locals.user?.email}" permanently deleted "${personName}".`
	});

	return json({ success: true });
};
