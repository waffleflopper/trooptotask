import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isPrivilegedRole } from '$lib/server/permissions';
import { createPermissionContext } from '$lib/server/permissionContext';
import { getApiContext } from '$lib/server/supabase';
import { canAddPersonnel } from '$lib/server/subscription';
import { checkReadOnly } from '$lib/server/read-only-guard';
import { auditLog } from '$lib/server/auditLog';

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	const ctx = !isSandbox ? await createPermissionContext(supabase, userId!, orgId) : null;
	ctx?.requireEdit('personnel');

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	// Enforce personnel cap
	const capCheck = await canAddPersonnel(supabase, orgId);
	if (!capCheck.allowed) {
		return json({ error: capCheck.message }, { status: 403 });
	}

	const body = await request.json();

	if (ctx && ctx.scopedGroupId && body.groupId !== ctx.scopedGroupId) {
		return json({ error: 'You can only add personnel to your assigned group' }, { status: 403 });
	}

	const row = {
		organization_id: orgId,
		rank: body.rank,
		last_name: body.lastName,
		first_name: body.firstName,
		mos: body.mos ?? '',
		clinic_role: body.clinicRole ?? '',
		group_id: body.groupId || null
	};

	const { data, error: dbError } = await supabase.from('personnel').insert(row).select('*, groups(name)').single();

	if (dbError) throw error(500, dbError.message);

	auditLog(
		{
			action: 'personnel.created',
			resourceType: 'personnel',
			resourceId: data.id,
			orgId,
			details: { actor: locals.user?.email ?? userId, name: `${data.rank} ${data.last_name}, ${data.first_name}` }
		},
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

	const ctx = !isSandbox ? await createPermissionContext(supabase, userId!, orgId) : null;
	ctx?.requireEdit('personnel');

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const body = await request.json();
	const { id, ...fields } = body;

	if (!id) throw error(400, 'Missing id');

	if (ctx && ctx.scopedGroupId) {
		const { data: person } = await supabase.from('personnel').select('group_id').eq('id', id).single();
		if (person?.group_id !== ctx.scopedGroupId) {
			throw error(403, 'You do not have access to personnel outside your group');
		}
	}

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
		{
			action: 'personnel.updated',
			resourceType: 'personnel',
			resourceId: id,
			orgId,
			details: { actor: locals.user?.email ?? userId, name: `${data.rank} ${data.last_name}, ${data.first_name}` }
		},
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

	const ctx = !isSandbox ? await createPermissionContext(supabase, userId!, orgId) : null;
	ctx?.requireEdit('personnel');

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const body = await request.json();
	const { id } = body;

	if (!id) throw error(400, 'Missing id');

	// Capture name before deletion for audit log
	const { data: existing } = await supabase
		.from('personnel')
		.select('rank, first_name, last_name, group_id')
		.eq('id', id)
		.eq('organization_id', orgId)
		.single();

	if (ctx && ctx.scopedGroupId) {
		if (existing?.group_id !== ctx.scopedGroupId) {
			throw error(403, 'You do not have access to personnel outside your group');
		}
	}

	if (ctx && !ctx.isPrivileged && !ctx.isFullEditor) {
		return json({ requiresApproval: true }, { status: 202 });
	}

	const { error: dbError } = await supabase
		.from('personnel')
		.update({ archived_at: new Date().toISOString() })
		.eq('id', id)
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	auditLog(
		{
			action: 'personnel.archived',
			resourceType: 'personnel',
			resourceId: id,
			orgId,
			details: {
				actor: locals.user?.email ?? userId,
				name: existing ? `${existing.rank} ${existing.last_name}, ${existing.first_name}` : id
			}
		},
		{ userId }
	);

	return json({ success: true });
};

export const PATCH: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (isSandbox) throw error(403, 'Not available in sandbox mode');
	if (!userId) throw error(401, 'Unauthorized');

	// Only admins/owners can restore
	const { data: mem } = await supabase
		.from('organization_memberships')
		.select('role')
		.eq('organization_id', orgId)
		.eq('user_id', userId)
		.single();

	if (!mem || !isPrivilegedRole(mem.role)) {
		throw error(403, 'Only admins and owners can restore archived personnel');
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const body = await request.json();
	const { action, id } = body;

	if (action !== 'restore') throw error(400, 'Invalid action');
	if (!id) throw error(400, 'Missing id');

	// Check personnel cap before restoring
	const capCheck = await canAddPersonnel(supabase, orgId);
	if (!capCheck.allowed) {
		return json({ message: capCheck.message }, { status: 422 });
	}

	// Verify this person is actually archived
	const { data: person } = await supabase
		.from('personnel')
		.select('rank, first_name, last_name, archived_at')
		.eq('id', id)
		.eq('organization_id', orgId)
		.single();

	if (!person) throw error(404, 'Personnel not found');
	if (!person.archived_at) throw error(400, 'Personnel is not archived');

	const { error: dbError } = await supabase
		.from('personnel')
		.update({ archived_at: null })
		.eq('id', id)
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	auditLog(
		{
			action: 'personnel.restored',
			resourceType: 'personnel',
			resourceId: id,
			orgId,
			details: {
				actor: locals.user?.email ?? userId,
				name: `${person.rank} ${person.last_name}, ${person.first_name}`
			}
		},
		{ userId }
	);

	return json({ success: true });
};
