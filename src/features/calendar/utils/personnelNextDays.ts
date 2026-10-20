import {
	layoutBars,
	shortRangeLabel,
	type AvailabilitySpan,
	type BarLayout,
	type StripDay
} from '$lib/components/patterns/calendar-bars';
import { dayWindow, fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';
import type { PersonnelCalendarWindow } from '../calendar.types';

export interface NextDaysLegendItem {
	key: string;
	name: string;
	detail: string;
}

export interface PersonnelNextDays {
	columns: StripDay[];
	layout: BarLayout;
	legend: NextDaysLegendItem[];
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CLOSURE_LABELS = { 'org-closure': 'DONSA', 'federal-holiday': 'Holiday' } as const;
const UNKNOWN_STATUS = { name: 'Unavailable', shortLabel: null, color: '#78716c', textColor: '#ffffff' };

/** Draws one Person's window as strip columns, bars and a legend that names everything the strip shows. */
export function buildPersonnelNextDays(window: PersonnelCalendarWindow): PersonnelNextDays {
	const first = toDayNumber(window.rangeStart);
	const days = toDayNumber(window.rangeEnd) - first + 1;
	const statusById = new Map(window.statusTypes.map((status) => [status.id, status]));
	const typeById = new Map(window.assignmentTypes.map((type) => [type.id, type]));
	const closureByDate = new Map(window.specialDays.map((day) => [day.date, CLOSURE_LABELS[day.type]]));

	const spans: AvailabilitySpan[] = [
		...window.availability.map((entry) => ({
			entry,
			status: statusById.get(entry.statusTypeId) ?? UNKNOWN_STATUS,
			start: toDayNumber(entry.startDate),
			end: toDayNumber(entry.endDate)
		})),
		...window.assignments.flatMap((assignment) => {
			const type = typeById.get(assignment.assignmentTypeId);
			if (!type) return [];
			const day = toDayNumber(assignment.date);
			const status = {
				name: type.shortName || type.name,
				shortLabel: type.shortName,
				color: type.color,
				textColor: type.textColor ?? '#ffffff'
			};
			return [{ entry: { id: assignment.id }, status, start: day, end: day }];
		})
	];

	const columns = Array.from({ length: days }, (_, index): StripDay => {
		const key = fromDayNumber(first + index);
		const weekday = new Date(`${key}T00:00:00Z`).getUTCDay();
		return {
			key,
			weekday: WEEKDAYS[weekday],
			date: Number(key.slice(8)),
			today: index === 0,
			weekend: weekday === 0 || weekday === 6,
			closure: closureByDate.get(key) ?? null
		};
	});

	const legend = [
		...spans.map((span) => ({
			start: span.start,
			key: span.entry.id,
			name: span.status.name,
			detail: [shortRangeLabel(span.start, span.end), span.entry.note?.trim()].filter(Boolean).join(' · ')
		})),
		...window.specialDays.map((day) => {
			const start = toDayNumber(day.date);
			return {
				start,
				key: day.id,
				name: CLOSURE_LABELS[day.type],
				detail: `${shortRangeLabel(start, start)} · ${day.name}`
			};
		})
	]
		.sort((a, b) => a.start - b.start)
		.map(({ key, name, detail }) => ({ key, name, detail }));

	return { columns, layout: layoutBars(spans, dayWindow(window.rangeStart, days), { view: 'strip' }), legend };
}
