import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import { getApiContext } from '$lib/server/supabase';
import { RosterHistoryEntity } from '$lib/server/entities/rosterHistory';

export const GET = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const orgId = event.params.orgId as string;
	const { supabase } = getApiContext(event.locals, event.cookies, orgId);

	const { data, error: dbError } = await supabase
		.from('duty_roster_history')
		.select('*')
		.eq('organization_id', orgId)
		.order('created_at', { ascending: false });

	if (dbError) throw error(500, dbError.message);

	return json(RosterHistoryEntity.fromDbArray((data ?? []) as Record<string, unknown>[]));
};

export const POST = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const orgId = event.params.orgId as string;
	const { supabase, userId } = getApiContext(event.locals, event.cookies, orgId);

	ctx.auth.requireEdit('calendar');

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) throw error(403, 'Organization is in read-only mode');

	const body = await event.request.json();

	const insertData = {
		...RosterHistoryEntity.toDbInsert(body, orgId),
		created_by_user_id: userId ?? null
	};

	const { data, error: dbError } = await supabase.from('duty_roster_history').insert(insertData).select().single();

	if (dbError) throw error(500, dbError.message);

	ctx.audit.log({ action: 'duty_roster.created', resourceType: 'duty_roster', resourceId: data.id });

	return json(RosterHistoryEntity.fromDb(data as Record<string, unknown>));
};
