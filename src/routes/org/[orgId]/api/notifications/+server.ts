import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import { getApiContext } from '$lib/server/supabase';

export const GET = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const orgId = event.params.orgId as string;
	const { supabase, userId } = getApiContext(event.locals, event.cookies, orgId);

	const { data, error: dbError } = await supabase
		.from('notifications')
		.select('*')
		.eq('user_id', userId)
		.eq('organization_id', orgId)
		.order('created_at', { ascending: false })
		.limit(20);

	if (dbError) throw error(500, dbError.message);
	return json(data ?? []);
};

export const PUT = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const orgId = event.params.orgId as string;
	const { supabase, userId } = getApiContext(event.locals, event.cookies, orgId);

	const body = await event.request.json();

	if (body.markAllRead) {
		const { error: dbError } = await supabase
			.from('notifications')
			.update({ read: true })
			.eq('user_id', userId)
			.eq('organization_id', orgId)
			.eq('read', false);

		if (dbError) throw error(500, dbError.message);
		ctx.audit.log({ action: 'notification.mark_all_read', resourceType: 'notification' });
		return json({ success: true });
	}

	if (body.id) {
		const { error: dbError } = await supabase
			.from('notifications')
			.update({ read: true })
			.eq('id', body.id)
			.eq('user_id', userId);

		if (dbError) throw error(500, dbError.message);
		ctx.audit.log({ action: 'notification.read', resourceType: 'notification', resourceId: body.id });
		return json({ success: true });
	}

	throw error(400, 'Missing id or markAllRead');
};

export const DELETE = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const orgId = event.params.orgId as string;
	const { supabase, userId } = getApiContext(event.locals, event.cookies, orgId);

	const body = await event.request.json();

	if (body.deleteAll) {
		const { error: dbError } = await supabase
			.from('notifications')
			.delete()
			.eq('user_id', userId)
			.eq('organization_id', orgId);

		if (dbError) throw error(500, dbError.message);
		ctx.audit.log({ action: 'notification.delete_all', resourceType: 'notification' });
		return json({ success: true });
	}

	if (!body.id) throw error(400, 'Missing notification id or deleteAll');

	const { error: dbError } = await supabase.from('notifications').delete().eq('id', body.id).eq('user_id', userId);

	if (dbError) throw error(500, dbError.message);
	ctx.audit.log({ action: 'notification.deleted', resourceType: 'notification', resourceId: body.id });
	return json({ success: true });
};
