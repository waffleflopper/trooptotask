import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createPermissionContext } from '$lib/server/permissionContext';
import { getApiContext } from '$lib/server/supabase';
import { checkReadOnly } from '$lib/server/read-only-guard';
import { auditLog } from '$lib/server/auditLog';
import { validateUUID } from '$lib/server/validation';

interface BatchAvailabilityRecord {
	personnelId: string;
	statusTypeId: string;
	startDate: string;
	endDate: string;
	note?: string | null;
}

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	let ctx: Awaited<ReturnType<typeof createPermissionContext>> | null = null;
	if (!isSandbox) {
		ctx = await createPermissionContext(supabase, userId!, orgId);
		ctx.requireEdit('calendar');
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const body = await request.json();
	const records: BatchAvailabilityRecord[] = body.records;

	if (!Array.isArray(records) || records.length === 0) {
		throw error(400, 'records array is required');
	}

	if (records.length > 500) {
		throw error(400, 'Maximum 500 records per batch');
	}

	// Enforce group scope if user is scoped
	const scopedGroupId = ctx?.scopedGroupId ?? null;

	if (scopedGroupId) {
		const personnelIds = [...new Set(records.map((r) => r.personnelId))];
		const { data: personnelData } = await supabase
			.from('personnel')
			.select('id, group_id')
			.eq('organization_id', orgId)
			.in('id', personnelIds)
			.is('archived_at', null);

		const groupMap = new Map((personnelData ?? []).map((p) => [p.id, p.group_id]));
		for (const rec of records) {
			const groupId = groupMap.get(rec.personnelId);
			if (groupId !== scopedGroupId) {
				throw error(403, 'Personnel not in your assigned group');
			}
		}
	}

	// Bulk insert
	const rows = records.map((r) => ({
		organization_id: orgId,
		personnel_id: r.personnelId,
		status_type_id: r.statusTypeId,
		start_date: r.startDate,
		end_date: r.endDate,
		note: r.note ?? null
	}));

	const { data: inserted, error: dbError } = await supabase.from('availability_entries').insert(rows).select();

	if (dbError) throw error(500, dbError.message);

	auditLog(
		{
			action: 'availability.bulk_created',
			resourceType: 'availability',
			orgId,
			details: {
				actor: locals.user?.email ?? userId,
				count: inserted.length
			}
		},
		{ userId }
	);

	const result = (inserted ?? []).map((d) => ({
		id: d.id,
		personnelId: d.personnel_id,
		statusTypeId: d.status_type_id,
		startDate: d.start_date,
		endDate: d.end_date,
		note: d.note ?? null
	}));

	return json({ inserted: result });
};

export const DELETE: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	let ctxDel: Awaited<ReturnType<typeof createPermissionContext>> | null = null;
	if (!isSandbox) {
		ctxDel = await createPermissionContext(supabase, userId!, orgId);
		ctxDel.requireEdit('calendar');
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const body = await request.json();
	const ids: string[] = body.ids;

	if (!Array.isArray(ids) || ids.length === 0) {
		throw error(400, 'ids array is required');
	}

	if (ids.length > 500) {
		throw error(400, 'Maximum 500 ids per batch');
	}

	// Validate all IDs are UUIDs
	for (const id of ids) {
		if (!validateUUID(id)) {
			throw error(400, 'Invalid ID format');
		}
	}

	// Enforce group scope if user is scoped
	const scopedGroupIdDel = ctxDel?.scopedGroupId ?? null;

	if (scopedGroupIdDel) {
		const { data: entries } = await supabase
			.from('availability_entries')
			.select('id, personnel_id')
			.eq('organization_id', orgId)
			.in('id', ids);

		const personnelIds = [...new Set((entries ?? []).map((e) => e.personnel_id))];
		const { data: personnelData } = await supabase
			.from('personnel')
			.select('id, group_id')
			.eq('organization_id', orgId)
			.in('id', personnelIds);

		const groupMap = new Map((personnelData ?? []).map((p) => [p.id, p.group_id]));
		for (const entry of entries ?? []) {
			const groupId = groupMap.get(entry.personnel_id);
			if (groupId !== scopedGroupIdDel) {
				throw error(403, 'Personnel not in your assigned group');
			}
		}
	}

	const { error: dbError, count } = await supabase
		.from('availability_entries')
		.delete({ count: 'exact' })
		.eq('organization_id', orgId)
		.in('id', ids);

	if (dbError) throw error(500, dbError.message);

	auditLog(
		{
			action: 'availability.bulk_deleted',
			resourceType: 'availability',
			orgId,
			details: {
				actor: locals.user?.email ?? userId,
				count: count ?? ids.length
			}
		},
		{ userId }
	);

	return json({ deleted: count ?? ids.length });
};
