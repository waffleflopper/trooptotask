import { json, error } from '@sveltejs/kit';
import { apiRoute } from '$lib/server/apiRoute';
import { auditLog } from '$lib/server/auditLog';
import { notifyAdmins } from '$lib/server/notifications';

export const DELETE = apiRoute(
	{ permission: { privileged: true }, blockSandbox: true },
	async ({ supabase, orgId, userId }, event) => {
		const body = await event.request.json();
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
					actor: event.locals.user?.email ?? userId,
					name: personName
				}
			},
			{ userId }
		);

		await notifyAdmins(orgId, userId, {
			type: 'personnel_permanently_deleted',
			title: 'Personnel Permanently Deleted',
			message: `"${event.locals.user?.email}" permanently deleted "${personName}".`
		});

		return json({ success: true });
	}
);
