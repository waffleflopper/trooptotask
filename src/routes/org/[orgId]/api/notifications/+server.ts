import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { orgId } = params;
	const user = locals.user;
	if (!user) throw error(401, 'Authentication required');

	const { data, error: dbError } = await locals.supabase
		.from('notifications')
		.select('*')
		.eq('user_id', user.id)
		.eq('organization_id', orgId)
		.order('created_at', { ascending: false })
		.limit(20);

	if (dbError) throw error(500, dbError.message);
	return json(data ?? []);
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const { orgId } = params;
	const user = locals.user;
	if (!user) throw error(401, 'Authentication required');

	const body = await request.json();

	if (body.markAllRead) {
		const { error: dbError } = await locals.supabase
			.from('notifications')
			.update({ read: true })
			.eq('user_id', user.id)
			.eq('organization_id', orgId)
			.eq('read', false);

		if (dbError) throw error(500, dbError.message);
		return json({ success: true });
	}

	if (body.id) {
		const { error: dbError } = await locals.supabase
			.from('notifications')
			.update({ read: true })
			.eq('id', body.id)
			.eq('user_id', user.id);

		if (dbError) throw error(500, dbError.message);
		return json({ success: true });
	}

	throw error(400, 'Missing id or markAllRead');
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Authentication required');

	const body = await request.json();

	if (body.deleteAll) {
		const { error: dbError } = await locals.supabase
			.from('notifications')
			.delete()
			.eq('user_id', user.id)
			.eq('organization_id', params.orgId);

		if (dbError) throw error(500, dbError.message);
		return json({ success: true });
	}

	if (!body.id) throw error(400, 'Missing notification id or deleteAll');

	const { error: dbError } = await locals.supabase
		.from('notifications')
		.delete()
		.eq('id', body.id)
		.eq('user_id', user.id);

	if (dbError) throw error(500, dbError.message);
	return json({ success: true });
};
