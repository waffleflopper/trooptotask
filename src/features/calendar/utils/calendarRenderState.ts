import type { AssignmentType, SpecialDay, DailyAssignment } from '$features/calendar/contracts';
import { formatDate, getDayName, isToday, isWeekend } from '$lib/utils/dates';

export const CALENDAR_DATE_LABEL = new Intl.DateTimeFormat('en-US', {
	weekday: 'long',
	month: 'long',
	day: 'numeric',
	year: 'numeric'
});

export interface CalendarDateHeaderState {
	date: Date;
	dateKey: string;
	dayName: string;
	dayOfMonth: number;
	dateLabel: string;
	weekend: boolean;
	today: boolean;
	specialDay?: SpecialDay;
	holiday: boolean;
	holidayName?: string;
	title: string;
}

export interface CalendarCellMarkerState {
	id: string;
	name: string;
	shortName: string;
	color: string;
}

export function buildCalendarDays(
	dates: readonly Date[],
	specialDays: readonly SpecialDay[]
): CalendarDateHeaderState[] {
	const specialDayByDate = new Map<string, SpecialDay>();
	for (const specialDay of specialDays) {
		if (!specialDayByDate.has(specialDay.date)) specialDayByDate.set(specialDay.date, specialDay);
	}
	return dates.map((date) => {
		const dateKey = formatDate(date);
		const specialDay = specialDayByDate.get(dateKey);
		return {
			date,
			dateKey,
			dayName: getDayName(date),
			dayOfMonth: date.getDate(),
			dateLabel: CALENDAR_DATE_LABEL.format(date),
			weekend: isWeekend(date),
			today: isToday(date),
			specialDay,
			holiday: !!specialDay,
			holidayName: specialDay?.name,
			title: specialDay?.name ?? 'Click to set daily assignments'
		};
	});
}

export type DutyMarkersByPersonAndDay = ReadonlyMap<string, ReadonlyMap<number, readonly CalendarCellMarkerState[]>>;

/** Whether the grid draws a row marker for this duty type; archived personnel types still do. */
export function drawsDutyMarker(type: AssignmentType): boolean {
	return type.assignTo === 'personnel';
}

export function buildDutyMarkers(
	assignments: readonly DailyAssignment[],
	assignmentTypes: readonly AssignmentType[],
	dateKeys: readonly string[]
): DutyMarkersByPersonAndDay {
	const typeById = new Map(assignmentTypes.map((type) => [type.id, type]));
	const dayByKey = new Map(dateKeys.map((dateKey, index) => [dateKey, index]));
	const byPerson = new Map<string, Map<number, CalendarCellMarkerState[]>>();
	for (const assignment of assignments) {
		const type = typeById.get(assignment.assignmentTypeId);
		const day = dayByKey.get(assignment.date);
		if (!type || !drawsDutyMarker(type) || day === undefined) continue;
		let byDay = byPerson.get(assignment.assigneeId);
		if (!byDay) {
			byDay = new Map();
			byPerson.set(assignment.assigneeId, byDay);
		}
		const marker = { id: assignment.id, name: type.name, shortName: type.shortName, color: type.color };
		const markers = byDay.get(day);
		if (markers) markers.push(marker);
		else byDay.set(day, [marker]);
	}
	return byPerson;
}
