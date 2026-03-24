import { fail } from '$lib/server/core/errors';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import { ALL_RANKS } from '$lib/types';
import { sanitizeString } from '$lib/server/validation';
import type { UseCaseContext } from '$lib/server/core/ports';

const entity = PersonnelEntity;
const AUDIT_RESOURCE = 'personnel';
const MAX_BATCH_SIZE = 500;

const ALL_RANKS_LOWER = ALL_RANKS.map((r) => r.toLowerCase());

interface BatchRecord {
	rank: string;
	lastName: string;
	firstName: string;
	mos?: string;
	clinicRole?: string;
	groupName?: string;
}

interface BatchInput {
	records: BatchRecord[];
}

interface BatchError {
	index: number;
	message: string;
}

interface BatchResult {
	inserted: unknown[];
	errors: BatchError[];
}

export async function importPersonnelBatch(ctx: UseCaseContext, input: BatchInput): Promise<BatchResult> {
	ctx.auth.requireEdit('personnel');

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) fail(403, 'Organization is in read-only mode');

	const { records } = input;

	if (!Array.isArray(records) || records.length === 0) {
		fail(400, 'records array is required');
	}

	if (records.length > MAX_BATCH_SIZE) {
		fail(400, `Maximum ${MAX_BATCH_SIZE} records per batch`);
	}

	// Fetch groups for name matching
	const groups = await ctx.store.findMany<{ id: string; name: string }>('groups', ctx.auth.orgId);
	const groupMap = new Map(groups.map((g) => [g.name.toLowerCase(), g.id]));

	const scopedGroupId = ctx.auth.scopedGroupId;

	// Validate all records
	const validRows: Array<{ index: number; row: Record<string, unknown> }> = [];
	const errors: BatchError[] = [];

	for (let i = 0; i < records.length; i++) {
		const rec = records[i];
		const rank = sanitizeString(rec.rank);
		const lastName = sanitizeString(rec.lastName);
		const firstName = sanitizeString(rec.firstName);

		if (!rank || !lastName || !firstName) {
			errors.push({ index: i, message: 'Rank, Last Name, and First Name are required' });
			continue;
		}

		const rankIdx = ALL_RANKS_LOWER.indexOf(rank.toLowerCase());
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
				organization_id: ctx.auth.orgId,
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
		return { inserted: [], errors };
	}

	// Enforce personnel cap against full batch size
	const available = await ctx.subscription.getAvailablePersonnelSlots();
	if (available !== null) {
		if (available <= 0) {
			fail(403, 'Personnel limit reached. Upgrade to add more.');
		}
		if (validRows.length > available) {
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
	const insertedRows = await ctx.store.insertMany<Record<string, unknown>>(
		entity.table,
		ctx.auth.orgId,
		validRows.map((v) => v.row),
		entity.select
	);

	ctx.subscription.invalidateTierCache();

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.bulk_created`,
		resourceType: AUDIT_RESOURCE,
		details: { count: insertedRows.length }
	});

	return {
		inserted: insertedRows.map((row) => entity.fromDb(row)),
		errors
	};
}
