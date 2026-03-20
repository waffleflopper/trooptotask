import { json, error } from '@sveltejs/kit';
import { apiRoute } from '$lib/server/apiRoute';

export const DELETE = apiRoute(
	{ permission: { edit: 'calendar' }, audit: 'duty_roster' },
	async ({ supabase, orgId }, event) => {
		const rosterId = event.params.rosterId as string;

		const { error: dbError } = await supabase
			.from('duty_roster_history')
			.delete()
			.eq('id', rosterId)
			.eq('organization_id', orgId);

		if (dbError) throw error(500, dbError.message);

		return json({ success: true });
	}
);
