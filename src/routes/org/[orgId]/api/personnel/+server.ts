import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditPermission } from '$lib/server/permissions';
import { checkPersonnelLimit } from '$lib/server/subscription';

// Get the organization owner's user ID for subscription checks
async function getOrgOwnerUserId(supabase: any, orgId: string): Promise<string | null> {
	const { data } = await supabase
		.from('organization_memberships')
		.select('user_id')
		.eq('organization_id', orgId)
		.eq('role', 'owner')
		.single();
	return data?.user_id ?? null;
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const { orgId } = params;
	await requireEditPermission(locals.supabase, orgId, user.id, 'personnel');

	// Check personnel limit (based on org owner's subscription)
	const ownerUserId = await getOrgOwnerUserId(locals.supabase, orgId);
	if (ownerUserId) {
		await checkPersonnelLimit(locals.supabase, ownerUserId, orgId);
	}

	const body = await request.json();

	const row = {
		organization_id: orgId,
		rank: body.rank,
		last_name: body.lastName,
		first_name: body.firstName,
		mos: body.mos ?? '',
		clinic_role: body.clinicRole ?? '',
		group_id: body.groupId || null
	};

	const { data, error: dbError } = await locals.supabase
		.from('personnel')
		.insert(row)
		.select('*, groups(name)')
		.single();

	if (dbError) throw error(500, dbError.message);

	return json({
		id: data.id,
		rank: data.rank,
		lastName: data.last_name,
		firstName: data.first_name,
		mos: data.mos,
		clinicRole: data.clinic_role,
		groupId: data.group_id,
		groupName: data.groups?.name ?? ''
	});
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const { orgId } = params;
	await requireEditPermission(locals.supabase, orgId, user.id, 'personnel');

	const body = await request.json();
	const { id, ...fields } = body;

	if (!id) throw error(400, 'Missing id');

	const updates: Record<string, unknown> = {};
	if (fields.rank !== undefined) updates.rank = fields.rank;
	if (fields.lastName !== undefined) updates.last_name = fields.lastName;
	if (fields.firstName !== undefined) updates.first_name = fields.firstName;
	if (fields.mos !== undefined) updates.mos = fields.mos;
	if (fields.clinicRole !== undefined) updates.clinic_role = fields.clinicRole;
	if (fields.groupId !== undefined) updates.group_id = fields.groupId || null;

	const { data, error: dbError } = await locals.supabase
		.from('personnel')
		.update(updates)
		.eq('id', id)
		.eq('organization_id', orgId)
		.select('*, groups(name)')
		.single();

	if (dbError) throw error(500, dbError.message);

	return json({
		id: data.id,
		rank: data.rank,
		lastName: data.last_name,
		firstName: data.first_name,
		mos: data.mos,
		clinicRole: data.clinic_role,
		groupId: data.group_id,
		groupName: data.groups?.name ?? ''
	});
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const { orgId } = params;
	await requireEditPermission(locals.supabase, orgId, user.id, 'personnel');

	const body = await request.json();
	const { id } = body;

	if (!id) throw error(400, 'Missing id');

	const { error: dbError } = await locals.supabase
		.from('personnel')
		.delete()
		.eq('id', id)
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	return json({ success: true });
};
