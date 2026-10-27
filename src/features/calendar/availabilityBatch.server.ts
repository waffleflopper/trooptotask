import { error } from '@sveltejs/kit';
import {
	CALENDAR_POLICY_ACTIONS,
	requireCalendarPersonnelPolicy,
	type CalendarAvailabilityPorts,
	type CalendarAvailabilityRemovalPorts
} from './calendarPolicy.server';
import { availabilityCreateInput } from './calendarPersistenceMapping.server';
import { isUuid, issueMessage } from '$lib/utils/inputSchemas';
import { AVAILABILITY_BATCH_LIMIT } from './contracts';

const AUDIT_RESOURCE = 'availability';

interface CreateAvailabilityBatchInput {
	records: Array<{
		personnelId: string;
		statusTypeId: string;
		startDate: string;
		endDate: string;
		note?: string | null;
		setForTaskingId?: string | null;
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

	if (records.length > AVAILABILITY_BATCH_LIMIT) {
		throw error(400, `Maximum ${AVAILABILITY_BATCH_LIMIT} records per batch`);
	}

	for (const [index, record] of records.entries()) {
		const parsed = availabilityCreateInput.safeParse(record);
		if (!parsed.success) {
			throw error(400, `Entry ${index + 1}: ${issueMessage(parsed.error)}`);
		}
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

	await ctx.audit.log({
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

	if (ids.length > AVAILABILITY_BATCH_LIMIT) {
		throw error(400, `Maximum ${AVAILABILITY_BATCH_LIMIT} ids per batch`);
	}

	if (!ids.every(isUuid)) throw error(400, 'Invalid ID');

	const personnelIds = await ctx.availabilityRemoval.findPersonnelIds(ids);
	await requireCalendarPersonnelPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageAvailability, personnelIds);

	const deletedCount = await ctx.availabilityRemoval.deleteIds(ids);

	await ctx.audit.log({
		action: `${AUDIT_RESOURCE}.bulk_deleted`,
		resourceType: AUDIT_RESOURCE,
		details: { count: deletedCount }
	});

	return { deleted: deletedCount };
}
