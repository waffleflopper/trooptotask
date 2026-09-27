import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
import type { CalendarRangeData } from '$features/calendar/calendar.types';
import type { CalendarBufferedRange } from './calendarRange';
import { mergeById } from '$lib/utils/mergeById';

type AvailabilityRangeEntry = CalendarRangeData['availabilityEntries'][number];
type SpecialDayRangeEntry = CalendarRangeData['specialDays'][number];
type CalendarRangeWindow = Pick<CalendarRangeData, 'rangeStart' | 'rangeEnd'>;

export async function loadCalendarRange(orgId: string, range: CalendarBufferedRange): Promise<CalendarRangeData> {
	const params = new URLSearchParams({
		rangeStart: range.rangeStart,
		rangeEnd: range.rangeEnd
	});
	const response = await fetch(`/org/${orgId}/api/calendar-range?${params.toString()}`);

	if (!response.ok) {
		throw new Error('Failed to load calendar range');
	}

	return response.json() as Promise<CalendarRangeData>;
}

function isAvailabilityEntryInRange(entry: AvailabilityRangeEntry, range: CalendarRangeWindow): boolean {
	return entry.endDate >= range.rangeStart && entry.startDate <= range.rangeEnd;
}

function isSpecialDayInRange(day: SpecialDayRangeEntry, range: CalendarRangeWindow): boolean {
	return day.date >= range.rangeStart && day.date <= range.rangeEnd;
}

export function mergeCalendarRangeIntoStores(orgId: string, data: CalendarRangeData): void {
	const availabilityEntries =
		availabilityStore.orgId === orgId
			? mergeById(
					availabilityStore.items.filter((entry) => !isAvailabilityEntryInRange(entry, data)),
					data.availabilityEntries
				)
			: data.availabilityEntries;
	const specialDays =
		specialDaysStore.orgId === orgId
			? mergeById(
					specialDaysStore.items.filter((day) => !isSpecialDayInRange(day, data)),
					data.specialDays
				)
			: data.specialDays;
	const dailyAssignments =
		dailyAssignmentsStore.orgId === orgId
			? mergeById(
					dailyAssignmentsStore.assignments.filter(
						(assignment) => assignment.date < data.rangeStart || assignment.date > data.rangeEnd
					),
					data.dailyAssignments
				)
			: data.dailyAssignments;

	availabilityStore.load(availabilityEntries, orgId);
	specialDaysStore.load(specialDays, orgId);
	dailyAssignmentsStore.load(dailyAssignmentsStore.types, dailyAssignments, orgId);
}
