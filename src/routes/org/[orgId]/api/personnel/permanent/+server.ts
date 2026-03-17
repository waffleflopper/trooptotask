import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getApiContext } from '$lib/server/supabase';
import { isPrivilegedRole } from '$lib/server/permissions';
import { checkReadOnly } from '$lib/server/read-only-guard';
import { auditLog } from '$lib/server/auditLog';
import { notifyAdmins } from '$lib/server/notifications';

export const DELETE: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (isSandbox) throw error(403, 'Not available in sandbox mode');
	if (!userId) throw error(401, 'Unauthorized');

	// Only admins/owners can permanently delete
	const { data: mem } = await supabase
		.from('organization_memberships')
		.select('role')
		.eq('organization_id', orgId)
		.eq('user_id', userId)
		.single();

	if (!mem || !isPrivilegedRole(mem.role)) {
		throw error(403, 'Only admins and owners can permanently delete personnel');
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const body = await request.json();
	const { id } = body;
	if (!id) throw error(400, 'Missing id');

	// Verify this person is archived (can only permanently delete archived personnel)
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

	auditLog(
		{
			action: 'personnel.permanently_deleted',
			resourceType: 'personnel',
			resourceId: id,
			orgId,
			details: {
				actor: locals.user?.email ?? userId,
				name: personName
			}
		},
		{ userId }
	);

	await notifyAdmins(orgId, userId, {
		type: 'personnel_permanently_deleted',
		title: 'Personnel Permanently Deleted',
		message: `"${locals.user?.email}" permanently deleted "${personName}".`
	});

	return json({ success: true });
};
