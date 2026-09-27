import type { CalendarWritePorts } from '$lib/server/core/useCases/calendarPolicy';
import type { SpecialDay } from '$lib/types';
import { SpecialDayEntity } from './specialDayEntity.server';

export interface SpecialDayRange {
	rangeStart: string;
	rangeEnd: string;
}

type SpecialDayStore = CalendarWritePorts['store'];

/** Retained Calendar range read; the caller has already passed Calendar view policy. */
export async function listSpecialDaysInRange(
	store: SpecialDayStore,
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

/** Raw saved rows for an already-authorized Organization export, including stored metadata. */
export function listSpecialDayExportRows(store: SpecialDayStore, orgId: string): Promise<Record<string, unknown>[]> {
	return store.findMany<Record<string, unknown>>('special_days', orgId);
}

/** Complete saved set for Calendar settings after overlapping local mutations. */
export async function listSpecialDays(store: SpecialDayStore, orgId: string): Promise<SpecialDay[]> {
	return SpecialDayEntity.fromDbArray(await listSpecialDayExportRows(store, orgId));
}
