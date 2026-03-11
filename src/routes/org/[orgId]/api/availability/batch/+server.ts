import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditPermission, getScopedGroupId, requireGroupAccess } from '$lib/server/permissions';
import { getApiContext } from '$lib/server/supabase';
import { checkReadOnly } from '$lib/server/read-only-guard';
import { auditLog } from '$lib/server/auditLog';

interface BatchAvailabilityRecord {
	personnelId: string;
	statusTypeId: string;
	startDate: string;
	endDate: string;
}

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'calendar');
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
	let scopedGroupId: string | null = null;
	if (!isSandbox && userId) {
		scopedGroupId = await getScopedGroupId(supabase, orgId, userId);
	}

	if (scopedGroupId) {
		const personnelIds = [...new Set(records.map(r => r.personnelId))];
		const { data: personnelData } = await supabase
			.from('personnel')
			.select('id, group_id')
			.eq('organization_id', orgId)
			.in('id', personnelIds)
			.is('archived_at', null);

		const groupMap = new Map((personnelData ?? []).map(p => [p.id, p.group_id]));
		for (const rec of records) {
			const groupId = groupMap.get(rec.personnelId);
			if (groupId !== scopedGroupId) {
				throw error(403, 'Personnel not in your assigned group');
			}
		}
	}

	// Bulk insert
	const rows = records.map(r => ({
		organization_id: orgId,
		personnel_id: r.personnelId,
		status_type_id: r.statusTypeId,
		start_date: r.startDate,
		end_date: r.endDate
	}));

	const { data: inserted, error: dbError } = await supabase
		.from('availability_entries')
		.insert(rows)
		.select();

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

	const result = (inserted ?? []).map(d => ({
		id: d.id,
		personnelId: d.personnel_id,
		statusTypeId: d.status_type_id,
		startDate: d.start_date,
		endDate: d.end_date
	}));

	return json({ inserted: result });
};
