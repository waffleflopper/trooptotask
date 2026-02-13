import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const { orgId } = params;
	const body = await request.json();

	if (body.action === 'replace') {
		// Replace all pinned groups for this user/org
		await locals.supabase
			.from('user_pinned_groups')
			.delete()
			.eq('user_id', user.id)
			.eq('organization_id', orgId);

		if (body.groups && body.groups.length > 0) {
			const rows = body.groups.map((groupName: string, i: number) => ({
				user_id: user.id,
				organization_id: orgId,
				group_name: groupName,
				sort_order: i
			}));

			const { error: dbError } = await locals.supabase
				.from('user_pinned_groups')
				.insert(rows);

			if (dbError) throw error(500, dbError.message);
		}

		return json({ success: true, groups: body.groups });
	}

	// Single pin
	const { data, error: dbError } = await locals.supabase
		.from('user_pinned_groups')
		.insert({
			user_id: user.id,
			organization_id: orgId,
			group_name: body.groupName,
			sort_order: body.sortOrder ?? 0
		})
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	return json({
		id: data.id,
		groupName: data.group_name,
		sortOrder: data.sort_order
	});
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const { orgId } = params;
	const body = await request.json();

	const { error: dbError } = await locals.supabase
		.from('user_pinned_groups')
		.delete()
		.eq('user_id', user.id)
		.eq('organization_id', orgId)
		.eq('group_name', body.groupName);

	if (dbError) throw error(500, dbError.message);

	return json({ success: true });
};
