import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createPermissionContext } from '$lib/server/permissionContext';
import { getApiContext } from '$lib/server/supabase';
import { checkReadOnly } from '$lib/server/read-only-guard';

export const DELETE: RequestHandler = async ({ params, locals, cookies }) => {
	const { orgId, rosterId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		const ctx = await createPermissionContext(supabase, userId!, orgId);
		ctx.requireEdit('calendar');
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const { error: dbError } = await supabase
		.from('duty_roster_history')
		.delete()
		.eq('id', rosterId)
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	return json({ success: true });
};
