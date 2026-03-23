import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import { getApiContext } from '$lib/server/supabase';

export const DELETE = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const orgId = event.params.orgId as string;
	const { supabase } = getApiContext(event.locals, event.cookies, orgId);

	ctx.auth.requireEdit('calendar');

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) throw error(403, 'Organization is in read-only mode');

	const rosterId = event.params.rosterId as string;

	const { error: dbError } = await supabase
		.from('duty_roster_history')
		.delete()
		.eq('id', rosterId)
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	ctx.audit.log({ action: 'duty_roster.deleted', resourceType: 'duty_roster', resourceId: rosterId });

	return json({ success: true });
};
