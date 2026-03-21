import { json, error } from '@sveltejs/kit';
import { apiRoute } from '$lib/server/apiRoute';
import { getEffectiveTier } from '$lib/server/subscription';
import { auditLog } from '$lib/server/auditLog';
import { sanitizeString } from '$lib/server/validation';
import { ALL_RANKS } from '$lib/types';
import { queryPersonnel } from '$lib/server/personnelRepository';
import { PersonnelEntity } from '$lib/server/entities/personnel';

interface BatchRecord {
	rank: string;
	lastName: string;
	firstName: string;
	mos?: string;
	clinicRole?: string;
	groupName?: string;
}

export const POST = apiRoute({ permission: { edit: 'personnel' } }, async ({ supabase, orgId, userId, ctx }, event) => {
	const body = await event.request.json();
	const records: BatchRecord[] = body.records;

	if (!Array.isArray(records) || records.length === 0) {
		throw error(400, 'records array is required');
	}

	if (records.length > 500) {
		throw error(400, 'Maximum 500 records per batch');
	}

	// Fetch groups for name matching
	const { data: groups } = await supabase.from('groups').select('id, name').eq('organization_id', orgId);
	const groupMap = new Map((groups ?? []).map((g) => [g.name.toLowerCase(), g.id]));

	// Get scoped group for non-privileged users
	const scopedGroupId = ctx?.scopedGroupId ?? null;

	// Validate all records
	const validRows: Array<{ index: number; row: Record<string, unknown> }> = [];
	const errors: Array<{ index: number; message: string }> = [];
	const allRanksLower = ALL_RANKS.map((r) => r.toLowerCase());

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

	// Enforce personnel cap against full batch size
	const tier = await getEffectiveTier(supabase, orgId);
	if (tier.personnelCap !== null && tier.personnelCap !== Infinity) {
		const { count: currentCount } = await queryPersonnel({
			supabase,
			orgId,
			headOnly: true,
			count: 'exact',
			select: '*'
		});

		const available = tier.personnelCap - (currentCount ?? 0);
		if (available <= 0) {
			return json(
				{
					error: `Personnel limit reached (${tier.personnelCap}). Upgrade to add more.`,
					inserted: [],
					errors
				},
				{ status: 403 }
			);
		}
		if (validRows.length > available) {
			// Trim excess rows and add cap errors for them
			const excess = validRows.splice(available);
			for (const { index } of excess) {
				errors.push({
					index,
					message: 'Personnel cap reached — this record would exceed your plan limit'
				});
			}
		}
	}

	// Bulk insert
	const { data: inserted, error: dbError } = await supabase
		.from('personnel')
		.insert(validRows.map((v) => v.row))
		.select('*, groups(name)');

	if (dbError) throw error(500, dbError.message);

	auditLog(
		{
			action: 'personnel.bulk_created',
			resourceType: 'personnel',
			orgId,
			details: {
				actor: event.locals.user?.email ?? userId,
				count: inserted.length
			}
		},
		{ userId }
	);

	const result = PersonnelEntity.fromDbArray((inserted ?? []) as Record<string, unknown>[]);

	return json({ inserted: result, errors });
});
