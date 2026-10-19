import type { AvailabilityEntry, StatusType } from '$features/calendar/contracts';
import { availabilityEntryLabel } from './availabilityLabels';
import type { BulkAddOverlap } from './availabilityMutation';
import { layoutBars } from '$lib/components/patterns/calendar-bars';
import type { CalendarBarLayout, CalendarSpan } from '$features/calendar/utils/calendarBars';
import { DAY_MS, dayWindow, toDayNumber, type DayWindow } from '$lib/utils/dayNumber';

/** Ranges up to this many days draw a day strip per person; longer ranges show only the hint text. */
export const MAX_STRIP_DAYS = 31;

export interface RosterDayHeading {
	readonly key: string;
	/** One letter, as on the strip's column header. */
	readonly weekday: string;
	readonly day: number;
	/** The full date, for the accessible name of the heading. */
	readonly label: string;
}

export interface BulkRosterAvailabilityRow {
	readonly kind: 'available' | 'overlap' | 'already-on-status';
	/** The row cannot be selected, and `hint` says why. */
	readonly blocked: boolean;
	/** Names every intersecting entry, same status first; null when the person has none. */
	readonly hint: string | null;
	/** The person's bars over `window`; null when the range is too long to draw. */
	readonly bars: CalendarBarLayout | null;
}

export interface BulkRosterAvailability {
	/** The strip's days; null when the range is longer than `MAX_STRIP_DAYS` or not a valid range. */
	readonly window: DayWindow | null;
	readonly headings: readonly RosterDayHeading[];
	/** Only people with an intersecting entry; everyone else reads as `AVAILABLE_ROW`. */
	readonly rows: ReadonlyMap<string, BulkRosterAvailabilityRow>;
}

const AVAILABLE_ROW: BulkRosterAvailabilityRow = {
	kind: 'available',
	blocked: false,
	hint: null,
	bars: null
};

const WEEKDAY_FORMAT = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' });
const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
	weekday: 'long',
	day: 'numeric',
	month: 'long',
	timeZone: 'UTC'
});

export function rosterAvailabilityRow(availability: BulkRosterAvailability, personnelId: string) {
	return availability.rows.get(personnelId) ?? AVAILABLE_ROW;
}

function headingFor(dayNumber: number): RosterDayHeading {
	const date = new Date(dayNumber * DAY_MS);
	return {
		key: String(dayNumber),
		weekday: WEEKDAY_FORMAT.format(date).charAt(0),
		day: date.getUTCDate(),
		label: DATE_FORMAT.format(date)
	};
}

function hintFor(overlap: BulkAddOverlap, labelOf: (entry: AvailabilityEntry) => string): string {
	const others = overlap.otherStatus.map(labelOf).join(', ');
	if (overlap.kind === 'overlap') return `${others} overlaps`;
	const same = `Already on ${overlap.sameStatus.map(labelOf).join(', ')}`;
	return others ? `${same} · ${others} overlaps` : same;
}

export function projectBulkRosterAvailability(input: {
	overlaps: ReadonlyMap<string, BulkAddOverlap>;
	statusTypes: readonly StatusType[];
	range: { rangeStart: string; rangeEnd: string } | null;
}): BulkRosterAvailability {
	const { overlaps, statusTypes, range } = input;
	const first = range ? toDayNumber(range.rangeStart) : 0;
	const days = range ? toDayNumber(range.rangeEnd) - first + 1 : 0;
	const window = range && days >= 1 && days <= MAX_STRIP_DAYS ? dayWindow(range.rangeStart, days) : null;

	const statuses = new Map(statusTypes.map((status) => [status.id, status]));
	const statusNames = new Map(statusTypes.map((status) => [status.id, status.name]));
	const labelOf = (entry: AvailabilityEntry) => availabilityEntryLabel(entry, statusNames);

	const rows = new Map<string, BulkRosterAvailabilityRow>();
	for (const [personnelId, overlap] of overlaps) {
		let bars: CalendarBarLayout | null = null;
		if (window) {
			const spans: CalendarSpan[] = [];
			for (const entry of [...overlap.sameStatus, ...overlap.otherStatus]) {
				const status = statuses.get(entry.statusTypeId);
				if (status) {
					spans.push({ entry, status, start: toDayNumber(entry.startDate), end: toDayNumber(entry.endDate) });
				}
			}
			bars = layoutBars(spans, window, { view: 'month', showStatusText: false });
		}
		rows.set(personnelId, {
			kind: overlap.kind,
			blocked: overlap.kind === 'already-on-status',
			hint: hintFor(overlap, labelOf),
			bars
		});
	}

	const headings = window ? Array.from({ length: window.days }, (_, at) => headingFor(window.start + at)) : [];
	return { window, headings, rows };
}
