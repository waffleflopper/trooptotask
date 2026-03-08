import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditPermission } from '$lib/server/permissions';
import { getApiContext } from '$lib/server/supabase';
import { canAddPersonnel } from '$lib/server/subscription';
import { checkReadOnly } from '$lib/server/read-only-guard';
import { auditLog } from '$lib/server/auditLog';

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	// Skip permission check for sandbox mode
	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	// Enforce personnel cap
	const capCheck = await canAddPersonnel(supabase, orgId);
	if (!capCheck.allowed) {
		return json({ error: capCheck.message }, { status: 403 });
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

	const { data, error: dbError } = await supabase
		.from('personnel')
		.insert(row)
		.select('*, groups(name)')
		.single();

	if (dbError) throw error(500, dbError.message);

	auditLog(
		{ action: 'personnel.created', resourceType: 'personnel', resourceId: data.id, orgId, details: { actor: locals.user?.email ?? userId, name: `${data.rank} ${data.last_name}, ${data.first_name}` } },
		{ userId }
	);

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

export const PUT: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	// Skip permission check for sandbox mode
	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

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

	const { data, error: dbError } = await supabase
		.from('personnel')
		.update(updates)
		.eq('id', id)
		.eq('organization_id', orgId)
		.select('*, groups(name)')
		.single();

	if (dbError) throw error(500, dbError.message);

	auditLog(
		{ action: 'personnel.updated', resourceType: 'personnel', resourceId: id, orgId, details: { actor: locals.user?.email ?? userId, name: `${data.rank} ${data.last_name}, ${data.first_name}` } },
		{ userId }
	);

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

export const DELETE: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	// Skip permission check for sandbox mode
	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const body = await request.json();
	const { id } = body;

	if (!id) throw error(400, 'Missing id');

	// Capture name before deletion for audit log
	const { data: existing } = await supabase
		.from('personnel')
		.select('rank, first_name, last_name')
		.eq('id', id)
		.eq('organization_id', orgId)
		.single();

	const { error: dbError } = await supabase
		.from('personnel')
		.delete()
		.eq('id', id)
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	auditLog(
		{ action: 'personnel.deleted', resourceType: 'personnel', resourceId: id, orgId, details: { actor: locals.user?.email ?? userId, name: existing ? `${existing.rank} ${existing.last_name}, ${existing.first_name}` : id } },
		{ userId }
	);

	return json({ success: true });
};
