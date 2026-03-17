import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getApiContext } from '$lib/server/supabase';
import { checkReadOnly } from '$lib/server/read-only-guard';

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	// Pinned groups require a user ID - skip for sandbox mode
	if (isSandbox) {
		return json({ success: true, groups: [] });
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const body = await request.json();

	if (body.action === 'replace') {
		// Replace all pinned groups for this user/org
		await supabase.from('user_pinned_groups').delete().eq('user_id', userId!).eq('organization_id', orgId);

		if (body.groups && body.groups.length > 0) {
			const rows = body.groups.map((groupName: string, i: number) => ({
				user_id: userId!,
				organization_id: orgId,
				group_name: groupName,
				sort_order: i
			}));

			const { error: dbError } = await supabase.from('user_pinned_groups').insert(rows);

			if (dbError) throw error(500, dbError.message);
		}

		return json({ success: true, groups: body.groups });
	}

	// Single pin
	const { data, error: dbError } = await supabase
		.from('user_pinned_groups')
		.insert({
			user_id: userId!,
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

export const DELETE: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	// Pinned groups require a user ID - skip for sandbox mode
	if (isSandbox) {
		return json({ success: true });
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const body = await request.json();

	const { error: dbError } = await supabase
		.from('user_pinned_groups')
		.delete()
		.eq('user_id', userId!)
		.eq('organization_id', orgId)
		.eq('group_name', body.groupName);

	if (dbError) throw error(500, dbError.message);

	return json({ success: true });
};
