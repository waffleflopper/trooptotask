/**
 * Bulk availability use case — set or clear availability for multiple personnel at once.
 *
 * `createAvailabilityBatch` inserts availability entries for the given personnel IDs
 * within a date range, up to MAX_BATCH_SIZE (500) entries per call.
 *
 * Single-record availability uses Calendar-owned operations behind the route.
 */
import { error } from '@sveltejs/kit';
import { AvailabilityEntryEntity } from './availabilityEntity.server';
import {
	CALENDAR_POLICY_ACTIONS,
	requireCalendarPersonnelPolicy,
	type CalendarWritePorts
} from '$lib/server/core/useCases/calendarPolicy';

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
	ctx: CalendarWritePorts,
	input: CreateAvailabilityBatchInput
): Promise<{ inserted: unknown[] }> {
	const { records } = input;

	if (!Array.isArray(records) || records.length === 0) {
		throw error(400, 'records array is required');
	}

	if (records.length > MAX_BATCH_SIZE) {
		throw error(400, `Maximum ${MAX_BATCH_SIZE} records per batch`);
	}

	const uniquePersonnelIds = [...new Set(records.map((r) => r.personnelId))];
	const people = await requireCalendarPersonnelPolicy(
		ctx,
		CALENDAR_POLICY_ACTIONS.manageAvailability,
		uniquePersonnelIds
	);
	if (people.size !== uniquePersonnelIds.length) {
		throw error(404, 'Person not found');
	}

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
	ctx: CalendarWritePorts,
	input: DeleteAvailabilityBatchInput
): Promise<{ deleted: number }> {
	const { ids } = input;

	if (!Array.isArray(ids) || ids.length === 0) {
		throw error(400, 'ids array is required');
	}

	if (ids.length > MAX_BATCH_SIZE) {
		throw error(400, `Maximum ${MAX_BATCH_SIZE} ids per batch`);
	}

	// Enforce group scope — look up personnel IDs from entries being deleted
	const lookupStore = ctx.rawStore ?? ctx.store;
	const existingRows = await lookupStore.findMany<Record<string, unknown>>(entity.table, ctx.auth.orgId, undefined, {
		inFilters: { id: ids },
		select: 'personnel_id'
	});
	await requireCalendarPersonnelPolicy(
		ctx,
		CALENDAR_POLICY_ACTIONS.manageAvailability,
		existingRows.map((row) => row.personnel_id).filter((id): id is string => typeof id === 'string')
	);

	// Batch delete all entries in one round-trip
	const deletedCount = await ctx.store.deleteManyByIds(entity.table, ctx.auth.orgId, ids);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.bulk_deleted`,
		resourceType: AUDIT_RESOURCE,
		details: { count: deletedCount }
	});

	return { deleted: deletedCount };
}
