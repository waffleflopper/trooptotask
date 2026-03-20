import { json, error } from '@sveltejs/kit';
import { apiRoute } from '$lib/server/apiRoute';
import { auditLog } from '$lib/server/auditLog';
import { validateUUID } from '$lib/server/validation';
import { validatePersonnelScope } from '$lib/server/personnelRepository';

interface BatchAvailabilityRecord {
	personnelId: string;
	statusTypeId: string;
	startDate: string;
	endDate: string;
	note?: string | null;
}

export const POST = apiRoute({ permission: { edit: 'calendar' } }, async ({ supabase, orgId, userId, ctx }, event) => {
	const body = await event.request.json();
	const records: BatchAvailabilityRecord[] = body.records;

	if (!Array.isArray(records) || records.length === 0) {
		throw error(400, 'records array is required');
	}

	if (records.length > 500) {
		throw error(400, 'Maximum 500 records per batch');
	}

	// Enforce group scope if user is scoped
	const scopedGroupId = ctx?.scopedGroupId ?? null;
	const uniquePersonnelIds = [...new Set(records.map((r) => r.personnelId))];
	await validatePersonnelScope(supabase, orgId, uniquePersonnelIds, scopedGroupId);

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
				actor: event.locals.user?.email ?? userId,
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
});

export const DELETE = apiRoute(
	{ permission: { edit: 'calendar' } },
	async ({ supabase, orgId, userId, ctx }, event) => {
		const body = await event.request.json();
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
		const scopedGroupId = ctx?.scopedGroupId ?? null;

		if (scopedGroupId) {
			const { data: entries } = await supabase
				.from('availability_entries')
				.select('id, personnel_id')
				.eq('organization_id', orgId)
				.in('id', ids);

			const personnelIdsFromEntries = [...new Set((entries ?? []).map((e) => e.personnel_id))];
			await validatePersonnelScope(supabase, orgId, personnelIdsFromEntries, scopedGroupId);
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
					actor: event.locals.user?.email ?? userId,
					count: count ?? ids.length
				}
			},
			{ userId }
		);

		return json({ deleted: count ?? ids.length });
	}
);
