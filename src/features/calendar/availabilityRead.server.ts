import type { AvailabilityEntry } from '$lib/types';
import type { resolveCalendarAssigneeScope } from '$lib/server/core/useCases/calendarScope';
import type { CalendarWritePorts } from '$lib/server/core/useCases/calendarPolicy';
import { AvailabilityEntryEntity } from './availabilityEntity.server';

export interface AvailabilityRangeInput {
	rangeStart: string;
	rangeEnd: string;
	personnelId?: string;
	/** Omitted means use the store's normal scope; an empty list returns no entries. */
	personnelIds?: string[];
	orderByEndDate?: boolean;
}

/** Date-overlap read shared by Calendar and its server consumers. */
export async function listAvailabilityEntries(
	ctx: Pick<Parameters<typeof resolveCalendarAssigneeScope>[0], 'store' | 'auth'>,
	input: AvailabilityRangeInput
): Promise<AvailabilityEntry[]> {
	const rows = await ctx.store.findMany<Record<string, unknown>>(
		AvailabilityEntryEntity.table,
		ctx.auth.orgId,
		input.personnelId === undefined ? undefined : { personnel_id: input.personnelId },
		{
			select: AvailabilityEntryEntity.select,
			...(input.personnelIds === undefined ? {} : { inFilters: { personnel_id: input.personnelIds } }),
			rangeFilters: [
				{ column: 'end_date', op: 'gte', value: input.rangeStart },
				{ column: 'start_date', op: 'lte', value: input.rangeEnd }
			],
			...(input.orderByEndDate ? { orderBy: [{ column: 'end_date', ascending: true }] } : {})
		}
	);
	return AvailabilityEntryEntity.fromDbArray(rows);
}

/** Full saved history for an already-authorized Personnel export. */
export async function listPersonnelAvailabilityHistory(
	ctx: Pick<CalendarWritePorts, 'auth'> & { rawStore: NonNullable<CalendarWritePorts['rawStore']> },
	personnelId: string
): Promise<AvailabilityEntry[]> {
	const rows = await ctx.rawStore.findMany<Record<string, unknown>>(
		AvailabilityEntryEntity.table,
		ctx.auth.orgId,
		{ personnel_id: personnelId },
		{
			select: AvailabilityEntryEntity.select,
			orderBy: [{ column: 'start_date', ascending: false }]
		}
	);
	return AvailabilityEntryEntity.fromDbArray(rows);
}
