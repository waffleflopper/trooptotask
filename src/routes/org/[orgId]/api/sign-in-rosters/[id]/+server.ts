import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import { getApiContext } from '$lib/server/supabase';

export const DELETE = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const orgId = event.params.orgId as string;
	const { supabase } = getApiContext(event.locals, event.cookies, orgId);

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

	const { error: dbError } = await supabase.from('sign_in_rosters').delete().eq('id', id).eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	ctx.audit.log({
		action: 'sign_in_roster.deleted',
		resourceType: 'sign_in_roster',
		resourceId: id,
		details: { actor: event.locals.user?.email ?? ctx.auth.userId, title: roster.title }
	});

	return json({ success: true });
};
