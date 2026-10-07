import type { CalendarAvailabilityPersistence, SavedAvailabilityEntry } from './contracts';

export interface AvailabilityRangeInput {
	rangeStart: string;
	rangeEnd: string;
	personnelId?: string;
	/** Omitted means use captured scope; an empty list returns no entries. */
	personnelIds?: string[];
	orderByEndDate?: boolean;
}

/** Date-overlap read shared by Calendar and its server consumers. */
export async function listAvailabilityEntries(
	ctx: { calendarAvailability: Pick<CalendarAvailabilityPersistence, 'listOverlapping'> },
	input: AvailabilityRangeInput
): Promise<SavedAvailabilityEntry[]> {
	return ctx.calendarAvailability.listOverlapping(input);
}

/** Full saved history for an already-authorized Personnel export. */
export async function listPersonnelAvailabilityHistory(
	ctx: { calendarAvailability: Pick<CalendarAvailabilityPersistence, 'listPersonnelHistory'> },
	personnelId: string
): Promise<SavedAvailabilityEntry[]> {
	return ctx.calendarAvailability.listPersonnelHistory(personnelId);
}
