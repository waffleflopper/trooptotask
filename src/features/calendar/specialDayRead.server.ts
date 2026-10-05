import type { CalendarWritePorts } from '$lib/server/core/useCases/calendarPolicy';
type DataStore = CalendarWritePorts['store'];
import type { SpecialDay } from '$features/calendar/contracts';
import { SpecialDayEntity } from './specialDayEntity.server';

export interface SpecialDayRange {
	rangeStart: string;
	rangeEnd: string;
}

/** Retained Calendar range read; the caller has already passed Calendar view policy. */
export async function listSpecialDaysInRange(
	store: DataStore,
	orgId: string,
	range: SpecialDayRange
): Promise<SpecialDay[]> {
	const rows = await store.findMany<Record<string, unknown>>('special_days', orgId, undefined, {
		rangeFilters: [
			{ column: 'date', op: 'gte', value: range.rangeStart },
			{ column: 'date', op: 'lte', value: range.rangeEnd }
		],
		orderBy: [{ column: 'date', ascending: true }]
	});
	return SpecialDayEntity.fromDbArray(rows);
}

/** Complete saved set for Calendar settings after overlapping local mutations. */
export async function listSpecialDays(store: DataStore, orgId: string): Promise<SpecialDay[]> {
	const rows = await store.findMany<Record<string, unknown>>('special_days', orgId);
	return SpecialDayEntity.fromDbArray(rows);
}
