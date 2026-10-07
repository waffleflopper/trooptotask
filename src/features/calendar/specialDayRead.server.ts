import type { CalendarCatalogPersistence, SavedSpecialDay } from './contracts';

export interface SpecialDayRange {
	rangeStart: string;
	rangeEnd: string;
}

/** Retained Calendar range read; the caller has already passed Calendar view policy. */
export async function listSpecialDaysInRange(
	catalogs: Pick<CalendarCatalogPersistence, 'listSpecialDays'>,
	range: SpecialDayRange
): Promise<SavedSpecialDay[]> {
	return catalogs.listSpecialDays(range);
}

/** Complete saved set for Calendar settings after overlapping local mutations. */
export function listSpecialDays(
	catalogs: Pick<CalendarCatalogPersistence, 'listSpecialDays'>
): Promise<SavedSpecialDay[]> {
	return catalogs.listSpecialDays();
}
