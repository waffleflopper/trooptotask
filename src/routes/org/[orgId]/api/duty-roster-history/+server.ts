import { json, error } from '@sveltejs/kit';
import { apiRoute } from '$lib/server/apiRoute';
import { RosterHistoryEntity } from '$lib/server/entities/rosterHistory';

export const GET = apiRoute({ permission: { authenticated: true }, readOnly: false }, async ({ supabase, orgId }) => {
	const { data, error: dbError } = await supabase
		.from('duty_roster_history')
		.select('*')
		.eq('organization_id', orgId)
		.order('created_at', { ascending: false });

	if (dbError) throw error(500, dbError.message);

	return json(RosterHistoryEntity.fromDbArray((data ?? []) as Record<string, unknown>[]));
});

export const POST = apiRoute(
	{ permission: { edit: 'calendar' }, audit: 'duty_roster' },
	async ({ supabase, orgId, userId }, event) => {
		const body = await event.request.json();

		const insertData = {
			...RosterHistoryEntity.toDbInsert(body, orgId),
			created_by_user_id: userId ?? null
		};

		const { data, error: dbError } = await supabase.from('duty_roster_history').insert(insertData).select().single();

		if (dbError) throw error(500, dbError.message);

		return json(RosterHistoryEntity.fromDb(data as Record<string, unknown>));
	}
);
