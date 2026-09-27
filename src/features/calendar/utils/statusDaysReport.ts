import type { AvailabilityEntry } from '$lib/types';
import type { Personnel } from '$lib/types';
import { comparePersonnelByRankThenName } from '$features/personnel/contracts';

export interface StatusDayRow {
	person: Personnel;
	statusDays: Map<string, number>; // statusTypeId → day count
	totalDays: number; // unique calendar days with any status
}

export interface StatusDaysResult {
	rows: StatusDayRow[];
	activeStatusTypeIds: string[]; // status type IDs that appear in results (for column headers)
}

/**
 * Expand a date range string pair into individual YYYY-MM-DD date strings,
 * clamped to the report's start/end bounds.
 */
function expandDateRange(entryStart: string, entryEnd: string, reportStart: string, reportEnd: string): string[] {
	const start = clampDate(entryStart, reportStart, reportEnd);
	const end = clampDate(entryEnd, reportStart, reportEnd);
	const dates: string[] = [];
	const current = new Date(start + 'T00:00:00');
	const endDate = new Date(end + 'T00:00:00');
	while (current <= endDate) {
		dates.push(
			`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
		);
		current.setDate(current.getDate() + 1);
	}
	return dates;
}

function clampDate(date: string, min: string, max: string): string {
	if (date < min) return min;
	if (date > max) return max;
	return date;
}

/**
 * Compute status day counts for each person.
 */
export function computeStatusDays(
	personnel: Personnel[],
	entries: AvailabilityEntry[],
	startDate: string,
	endDate: string
): StatusDaysResult {
	// Index entries by personnelId for fast lookup
	const entriesByPerson = new Map<string, AvailabilityEntry[]>();
	for (const entry of entries) {
		let list = entriesByPerson.get(entry.personnelId);
		if (!list) {
			list = [];
			entriesByPerson.set(entry.personnelId, list);
		}
		list.push(entry);
	}

	const activeStatusTypeIds = new Set<string>();
	const rows: StatusDayRow[] = [];

	for (const person of personnel) {
		const personEntries = entriesByPerson.get(person.id) ?? [];
		const statusDays = new Map<string, number>();
		const allDatesWithStatus = new Set<string>();

		for (const entry of personEntries) {
			const dates = expandDateRange(entry.startDate, entry.endDate, startDate, endDate);
			for (const dateStr of dates) {
				allDatesWithStatus.add(dateStr);
				statusDays.set(entry.statusTypeId, (statusDays.get(entry.statusTypeId) ?? 0) + 1);
				activeStatusTypeIds.add(entry.statusTypeId);
			}
		}

		rows.push({
			person,
			statusDays,
			totalDays: allDatesWithStatus.size
		});
	}

	rows.sort((a, b) => comparePersonnelByRankThenName(a.person, b.person));

	return {
		rows,
		activeStatusTypeIds: [...activeStatusTypeIds]
	};
}
