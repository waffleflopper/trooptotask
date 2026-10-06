/**
 * Bulk availability use case — set or clear availability for multiple personnel at once.
 *
 * `createAvailabilityBatch` inserts availability entries for the given personnel IDs
 * within a date range, up to MAX_BATCH_SIZE (500) entries per call.
 *
 * Single-record availability uses Calendar-owned operations behind the route.
 */
import { error } from '@sveltejs/kit';
import {
	CALENDAR_POLICY_ACTIONS,
	requireCalendarPersonnelPolicy,
	type CalendarAvailabilityPorts,
	type CalendarAvailabilityRemovalPorts
} from '$lib/server/core/useCases/calendarPolicy';

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
	ctx: CalendarAvailabilityPorts,
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

	const inserted = await ctx.calendarAvailability.createMany(records);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.bulk_created`,
		resourceType: AUDIT_RESOURCE,
		details: { count: inserted.length }
	});

	return { inserted };
}

interface DeleteAvailabilityBatchInput {
	ids: string[];
}

export async function deleteAvailabilityBatch(
	ctx: CalendarAvailabilityRemovalPorts,
	input: DeleteAvailabilityBatchInput
): Promise<{ deleted: number }> {
	const { ids } = input;

	if (!Array.isArray(ids) || ids.length === 0) {
		throw error(400, 'ids array is required');
	}

	if (ids.length > MAX_BATCH_SIZE) {
		throw error(400, `Maximum ${MAX_BATCH_SIZE} ids per batch`);
	}

	const personnelIds = await ctx.availabilityRemoval.findPersonnelIds(ids);
	await requireCalendarPersonnelPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageAvailability, personnelIds);

	const deletedCount = await ctx.availabilityRemoval.deleteIds(ids);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.bulk_deleted`,
		resourceType: AUDIT_RESOURCE,
		details: { count: deletedCount }
	});

	return { deleted: deletedCount };
}
