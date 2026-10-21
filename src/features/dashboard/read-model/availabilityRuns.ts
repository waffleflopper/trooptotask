import type { AvailabilityEntry } from '$features/calendar/contracts';
import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';

export interface AvailabilityRun {
	startDate: string;
	endDate: string;
	/** The entry that opens the run; it names the status a Person leaves for. */
	first: AvailabilityEntry;
}

/**
 * Each Person's covered days as continuous runs, soonest first. Overlapping or back-to-back entries
 * join one run, so a change of status inside it is neither a departure nor a return. A Person leaves
 * on a run's first day and is back the day after it ends.
 */
export function availabilityRuns(
	entries: readonly AvailabilityEntry[]
): ReadonlyMap<string, readonly AvailabilityRun[]> {
	const byPerson = new Map<string, AvailabilityEntry[]>();
	for (const entry of entries) {
		const own = byPerson.get(entry.personnelId);
		if (own) own.push(entry);
		else byPerson.set(entry.personnelId, [entry]);
	}

	const runs = new Map<string, AvailabilityRun[]>();
	for (const [personnelId, own] of byPerson) {
		own.sort((a, b) => a.startDate.localeCompare(b.startDate) || b.endDate.localeCompare(a.endDate));
		const merged: AvailabilityRun[] = [];
		for (const entry of own) {
			const current = merged[merged.length - 1];
			if (current && toDayNumber(entry.startDate) <= toDayNumber(current.endDate) + 1) {
				if (entry.endDate > current.endDate) current.endDate = entry.endDate;
			} else {
				merged.push({ startDate: entry.startDate, endDate: entry.endDate, first: entry });
			}
		}
		runs.set(personnelId, merged);
	}
	return runs;
}

/** The first day a run no longer covers its Person. */
export function backDate(run: AvailabilityRun): string {
	return fromDayNumber(toDayNumber(run.endDate) + 1);
}
