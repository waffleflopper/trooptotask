import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditPermission, getScopedGroupId } from '$lib/server/permissions';
import { getApiContext } from '$lib/server/supabase';
import { canAddPersonnel } from '$lib/server/subscription';
import { checkReadOnly } from '$lib/server/read-only-guard';
import { auditLog } from '$lib/server/auditLog';
import { sanitizeString } from '$lib/server/validation';
import { ALL_RANKS } from '$lib/types';

interface BatchRecord {
	rank: string;
	lastName: string;
	firstName: string;
	mos?: string;
	clinicRole?: string;
	groupName?: string;
}

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const body = await request.json();
	const records: BatchRecord[] = body.records;

	if (!Array.isArray(records) || records.length === 0) {
		throw error(400, 'records array is required');
	}

	if (records.length > 500) {
		throw error(400, 'Maximum 500 records per batch');
	}

	// Check personnel cap
	const capCheck = await canAddPersonnel(supabase, orgId);
	if (!capCheck.allowed) {
		return json({ error: capCheck.message, inserted: [], errors: [] }, { status: 403 });
	}

	// Fetch groups for name matching
	const { data: groups } = await supabase
		.from('groups')
		.select('id, name')
		.eq('organization_id', orgId);
	const groupMap = new Map((groups ?? []).map(g => [g.name.toLowerCase(), g.id]));

	// Get scoped group for non-privileged users
	let scopedGroupId: string | null = null;
	if (!isSandbox && userId) {
		scopedGroupId = await getScopedGroupId(supabase, orgId, userId);
	}

	// Validate all records
	const validRows: Array<{ index: number; row: Record<string, unknown> }> = [];
	const errors: Array<{ index: number; message: string }> = [];
	const allRanksLower = ALL_RANKS.map(r => r.toLowerCase());

	for (let i = 0; i < records.length; i++) {
		const rec = records[i];
		const rank = sanitizeString(rec.rank);
		const lastName = sanitizeString(rec.lastName);
		const firstName = sanitizeString(rec.firstName);

		if (!rank || !lastName || !firstName) {
			errors.push({ index: i, message: 'Rank, Last Name, and First Name are required' });
			continue;
		}

		const rankIdx = allRanksLower.indexOf(rank.toLowerCase());
		if (rankIdx === -1) {
			errors.push({ index: i, message: `Invalid rank "${rank}"` });
			continue;
		}

		const groupName = sanitizeString(rec.groupName);
		let groupId: string | null = null;
		if (groupName) {
			groupId = groupMap.get(groupName.toLowerCase()) ?? null;
		}

		if (scopedGroupId && groupId !== scopedGroupId) {
			errors.push({ index: i, message: 'You can only add personnel to your assigned group' });
			continue;
		}

		validRows.push({
			index: i,
			row: {
				organization_id: orgId,
				rank: ALL_RANKS[rankIdx],
				last_name: lastName,
				first_name: firstName,
				mos: sanitizeString(rec.mos) || '',
				clinic_role: sanitizeString(rec.clinicRole) || '',
				group_id: groupId
			}
		});
	}

	if (validRows.length === 0) {
		return json({ inserted: [], errors });
	}

	// Bulk insert
	const { data: inserted, error: dbError } = await supabase
		.from('personnel')
		.insert(validRows.map(v => v.row))
		.select('*, groups(name)');

	if (dbError) throw error(500, dbError.message);

	auditLog(
		{
			action: 'personnel.bulk_created',
			resourceType: 'personnel',
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
		rank: d.rank,
		lastName: d.last_name,
		firstName: d.first_name,
		mos: d.mos,
		clinicRole: d.clinic_role,
		groupId: d.group_id,
		groupName: d.groups?.name ?? ''
	}));

	return json({ inserted: result, errors });
};
