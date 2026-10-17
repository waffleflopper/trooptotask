import type { AvailabilityEntry } from '$features/calendar/contracts';
import { parseDate } from '$lib/utils/dates';

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric' });
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

/** "Leave 26 Oct", "Leave 20–23 Oct" or "Leave 26 Oct – 3 Nov"; an unknown status reads "Unavailable". */
export function availabilityEntryLabel(
	entry: Pick<AvailabilityEntry, 'statusTypeId' | 'startDate' | 'endDate'>,
	statusNames: ReadonlyMap<string, string>
): string {
	return `${statusNames.get(entry.statusTypeId) ?? 'Unavailable'} ${dateRange(entry.startDate, entry.endDate)}`;
}

function dateRange(startKey: string, endKey: string): string {
	const start = parseDate(startKey);
	const end = parseDate(endKey);
	if (startKey === endKey) return DAY_MONTH.format(start);
	if (startKey.slice(0, 7) === endKey.slice(0, 7)) return `${DAY.format(start)}–${DAY_MONTH.format(end)}`;
	return `${DAY_MONTH.format(start)} – ${DAY_MONTH.format(end)}`;
}
