import { json, error } from '@sveltejs/kit';
import { apiRoute } from '$lib/server/apiRoute';
import { auditLog } from '$lib/server/auditLog';

export const DELETE = apiRoute(
	{ permission: { none: true }, readOnly: false },
	async ({ supabase, orgId, userId }, event) => {
		const id = event.params.id;

		// Fetch the roster first to check for signed file
		const { data: roster } = await supabase
			.from('sign_in_rosters')
			.select('signed_file_path, title')
			.eq('id', id)
			.eq('organization_id', orgId)
			.single();

		if (!roster) throw error(404, 'Roster not found');

		// Delete signed file from storage if exists
		if (roster.signed_file_path) {
			await supabase.storage.from('counseling-files').remove([roster.signed_file_path]);
		}

		const { error: dbError } = await supabase
			.from('sign_in_rosters')
			.delete()
			.eq('id', id)
			.eq('organization_id', orgId);

		if (dbError) throw error(500, dbError.message);

		auditLog(
			{
				action: 'sign_in_roster.deleted',
				resourceType: 'sign_in_roster',
				resourceId: id,
				orgId,
				details: { actor: event.locals.user?.email ?? userId, title: roster.title }
			},
			{ userId }
		);

		return json({ success: true });
	}
);
