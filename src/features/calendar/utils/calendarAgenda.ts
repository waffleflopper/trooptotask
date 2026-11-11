import type { AssignmentType, DailyAssignment, SpecialDay } from '$features/calendar/contracts';
import type { Personnel } from '$features/personnel/contracts';
import type { AvailabilityTracks } from '$features/calendar/utils/availabilityTracks';
import type { CalendarSpan } from '$features/calendar/utils/calendarBars';
import { assignmentSlotKey } from '$features/calendar/utils/calendarIndexes';
import { buildCalendarDays, drawsDutyMarker } from '$features/calendar/utils/calendarRenderState';
import { dayWindow, toDayNumber } from '$lib/utils/dayNumber';

export interface AgendaDuty {
	readonly assignment: DailyAssignment;
	readonly type: AssignmentType;
	/** Why the person is unavailable that day, the reason the grid's duty lane shows. */
	readonly conflict?: string;
}

export interface AgendaPerson {
	readonly person: Personnel;
	readonly statuses: readonly CalendarSpan[];
	readonly duties: readonly AgendaDuty[];
}

export interface AgendaDay {
	readonly date: Date;
	readonly dateKey: string;
	readonly today: boolean;
	readonly specialDay?: SpecialDay;
	readonly available: number;
	readonly total: number;
	readonly people: readonly AgendaPerson[];
}

export function rosterPeople(bands: readonly { readonly personnel: readonly Personnel[] }[]): Personnel[] {
	const seen = new Set<string>();
	const people: Personnel[] = [];
	for (const band of bands) {
		for (const person of band.personnel) {
			if (seen.has(person.id)) continue;
			seen.add(person.id);
			people.push(person);
		}
	}
	return people;
}

export interface AgendaInput {
	readonly dates: readonly Date[];
	readonly people: readonly Personnel[];
	readonly tracks: AvailabilityTracks;
	readonly specialDays: readonly SpecialDay[];
	readonly assignments: readonly DailyAssignment[];
	readonly assignmentTypes: readonly AssignmentType[];
	/** Conflict reasons by `assignmentSlotKey`, as the grid's duty lane receives them. */
	readonly unavailable?: ReadonlyMap<string, string>;
}

/**
 * One entry per day, listing the same entries the month grid draws for `people`: the statuses covering the day,
 * and the person-assigned duties the grid marks on their row.
 */
export function buildCalendarAgenda(input: AgendaInput): AgendaDay[] {
	const days = buildCalendarDays(input.dates, input.specialDays);
	if (days.length === 0) return [];
	const window = dayWindow(days[0].dateKey, days.length);
	const dayIndex = new Map(days.map((day, index) => [day.dateKey, index]));
	const outCounts = input.tracks.outCounts(
		input.people.map((person) => person.id),
		window
	);

	const typeById = new Map(input.assignmentTypes.map((type) => [type.id, type]));
	const typeOrder = new Map(input.assignmentTypes.map((type, index) => [type.id, index]));
	const dutiesByPerson = new Map<string, AgendaDuty[][]>();
	for (const assignment of input.assignments) {
		const type = typeById.get(assignment.assignmentTypeId);
		const index = dayIndex.get(assignment.date);
		if (!type || !drawsDutyMarker(type) || index === undefined) continue;
		let byDay = dutiesByPerson.get(assignment.assigneeId);
		if (!byDay) {
			byDay = days.map(() => []);
			dutiesByPerson.set(assignment.assigneeId, byDay);
		}
		const conflict = input.unavailable?.get(assignmentSlotKey(assignment.date, type.id));
		byDay[index].push(conflict === undefined ? { assignment, type } : { assignment, type, conflict });
	}
	for (const byDay of dutiesByPerson.values()) {
		for (const duties of byDay) {
			duties.sort(
				(a, b) =>
					typeOrder.get(a.type.id)! - typeOrder.get(b.type.id)! ||
					(a.assignment.id < b.assignment.id ? -1 : a.assignment.id > b.assignment.id ? 1 : 0)
			);
		}
	}

	const lastDay = window.start + window.days - 1;
	const statusesByPerson = new Map<string, readonly CalendarSpan[]>();
	for (const person of input.people) {
		const inWindow = input.tracks.spans(person.id).filter((span) => span.end >= window.start && span.start <= lastDay);
		if (inWindow.length > 0) statusesByPerson.set(person.id, inWindow);
	}

	return days.map((day, index) => {
		const dayNumber = toDayNumber(day.dateKey);
		const people: AgendaPerson[] = [];
		for (const person of input.people) {
			const statuses = statusesByPerson
				.get(person.id)
				?.filter((span) => span.start <= dayNumber && span.end >= dayNumber);
			const duties = dutiesByPerson.get(person.id)?.[index];
			if (!statuses?.length && !duties?.length) continue;
			people.push({ person, statuses: statuses ?? [], duties: duties ?? [] });
		}
		return {
			date: day.date,
			dateKey: day.dateKey,
			today: day.today,
			specialDay: day.specialDay,
			available: input.people.length - outCounts[index],
			total: input.people.length,
			people
		};
	});
}
