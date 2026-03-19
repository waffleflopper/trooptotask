import { json, error } from '@sveltejs/kit';
import { apiRoute } from '$lib/server/apiRoute';

export const GET = apiRoute(
	{ permission: { authenticated: true }, readOnly: false },
	async ({ supabase, orgId, userId }) => {
		const { data, error: dbError } = await supabase
			.from('notifications')
			.select('*')
			.eq('user_id', userId)
			.eq('organization_id', orgId)
			.order('created_at', { ascending: false })
			.limit(20);

		if (dbError) throw error(500, dbError.message);
		return json(data ?? []);
	}
);

export const PUT = apiRoute(
	{ permission: { authenticated: true }, readOnly: false },
	async ({ supabase, orgId, userId }, event) => {
		const body = await event.request.json();

		if (body.markAllRead) {
			const { error: dbError } = await supabase
				.from('notifications')
				.update({ read: true })
				.eq('user_id', userId)
				.eq('organization_id', orgId)
				.eq('read', false);

			if (dbError) throw error(500, dbError.message);
			return json({ success: true });
		}

		if (body.id) {
			const { error: dbError } = await supabase
				.from('notifications')
				.update({ read: true })
				.eq('id', body.id)
				.eq('user_id', userId);

			if (dbError) throw error(500, dbError.message);
			return json({ success: true });
		}

		throw error(400, 'Missing id or markAllRead');
	}
);

export const DELETE = apiRoute(
	{ permission: { authenticated: true }, readOnly: false },
	async ({ supabase, orgId, userId }, event) => {
		const body = await event.request.json();

		if (body.deleteAll) {
			const { error: dbError } = await supabase
				.from('notifications')
				.delete()
				.eq('user_id', userId)
				.eq('organization_id', orgId);

			if (dbError) throw error(500, dbError.message);
			return json({ success: true });
		}

		if (!body.id) throw error(400, 'Missing notification id or deleteAll');

		const { error: dbError } = await supabase
			.from('notifications')
			.delete()
			.eq('id', body.id)
			.eq('user_id', userId);

		if (dbError) throw error(500, dbError.message);
		return json({ success: true });
	}
);
