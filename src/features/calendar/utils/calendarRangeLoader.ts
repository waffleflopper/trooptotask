import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
import type { CalendarRangeData } from '$lib/server/core/useCases/calendarQuery';
import type { CalendarBufferedRange } from './calendarRange';
import { mergeById } from '$lib/utils/mergeById';

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

export function mergeCalendarRangeIntoStores(orgId: string, data: CalendarRangeData): void {
	const availabilityEntries =
		availabilityStore.orgId === orgId
			? mergeById(availabilityStore.items, data.availabilityEntries)
			: data.availabilityEntries;
	const specialDays =
		specialDaysStore.orgId === orgId ? mergeById(specialDaysStore.items, data.specialDays) : data.specialDays;
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
