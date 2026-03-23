import { AvailabilityEntryEntity } from '$lib/server/entities/availabilityEntry';
import type { UseCaseContext } from '$lib/server/core/ports';

function fail(status: number, message: string): never {
	const err = new Error(message);
	(err as unknown as Record<string, unknown>).status = status;
	throw err;
}

const entity = AvailabilityEntryEntity;
const AUDIT_RESOURCE = 'availability';
const MAX_BATCH_SIZE = 500;

interface CreateAvailabilityBatchInput {
	records: Array<{
		personnelId: string;
		statusTypeId: string;
		startDate: string;
		endDate: string;
		note?: string | null;
	}>;
}

export async function createAvailabilityBatch(
	ctx: UseCaseContext,
	input: CreateAvailabilityBatchInput
): Promise<{ inserted: unknown[] }> {
	ctx.auth.requireEdit('calendar');

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) fail(403, 'Organization is in read-only mode');

	const { records } = input;

	if (!Array.isArray(records) || records.length === 0) {
		fail(400, 'records array is required');
	}

	if (records.length > MAX_BATCH_SIZE) {
		fail(400, `Maximum ${MAX_BATCH_SIZE} records per batch`);
	}

	// Enforce group scope in one batch call
	const uniquePersonnelIds = [...new Set(records.map((r) => r.personnelId))];
	await ctx.auth.requireGroupAccessBatch(uniquePersonnelIds);

	// Transform and bulk insert
	const rows = records.map((r) => entity.toDbInsert(r, ctx.auth.orgId));
	const inserted = await ctx.store.insertMany<Record<string, unknown>>(entity.table, ctx.auth.orgId, rows);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.bulk_created`,
		resourceType: AUDIT_RESOURCE,
		details: { count: inserted.length }
	});

	return { inserted: inserted.map((row) => entity.fromDb(row)) };
}

interface DeleteAvailabilityBatchInput {
	ids: string[];
}

export async function deleteAvailabilityBatch(
	ctx: UseCaseContext,
	input: DeleteAvailabilityBatchInput
): Promise<{ deleted: number }> {
	ctx.auth.requireEdit('calendar');

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) fail(403, 'Organization is in read-only mode');

	const { ids } = input;

	if (!Array.isArray(ids) || ids.length === 0) {
		fail(400, 'ids array is required');
	}

	if (ids.length > MAX_BATCH_SIZE) {
		fail(400, `Maximum ${MAX_BATCH_SIZE} ids per batch`);
	}

	// Enforce group scope — look up personnel IDs from entries being deleted
	if (ctx.auth.scopedGroupId) {
		const entries = await ctx.store.findMany<{ personnel_id: string }>(entity.table, ctx.auth.orgId, undefined, {
			inFilters: { id: ids }
		});
		const personnelIds = [...new Set(entries.map((e) => e.personnel_id))];
		await ctx.auth.requireGroupAccessBatch(personnelIds);
	}

	// Delete each entry
	let deletedCount = 0;
	for (const id of ids) {
		try {
			await ctx.store.delete(entity.table, ctx.auth.orgId, id);
			deletedCount++;
		} catch {
			// Entry may not exist — skip
		}
	}

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.bulk_deleted`,
		resourceType: AUDIT_RESOURCE,
		details: { count: deletedCount }
	});

	return { deleted: deletedCount };
}
