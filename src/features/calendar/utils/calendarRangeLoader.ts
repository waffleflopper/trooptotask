import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
import type { CalendarRangeData } from '$features/calendar/calendar.types';
import type { AvailabilityEntry, DailyAssignment, SpecialDay } from '$features/calendar/contracts';
import { stillInOrganizationLifetime, type StoreRead } from '$lib/stores/core';
import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';
import { DUTY_LOOKBACK_DAYS, rangeCoversDate, rangeCoversSpan, type CalendarRangeRequest } from './calendarRange';

export interface CalendarRangeRead {
	availability: StoreRead<AvailabilityEntry>;
	specialDays: StoreRead<SpecialDay>;
	assignments: StoreRead<DailyAssignment>;
	close(): void;
}

export async function loadCalendarRange(orgId: string, read: CalendarRangeRequest): Promise<CalendarRangeData> {
	const params = new URLSearchParams({
		rangeStart: read.rangeStart,
		rangeEnd: read.rangeEnd,
		collections: read.collections.join(',')
	});
	const response = await fetch(`/org/${orgId}/api/calendar-range?${params.toString()}`);

	if (!response.ok) {
		throw new Error('Failed to load calendar range');
	}

	return response.json() as Promise<CalendarRangeData>;
}

/** Begin before requesting a range so applying it keeps saves and deletes confirmed meanwhile. */
export function beginCalendarRangeRead(): CalendarRangeRead {
	const reads = {
		availability: availabilityStore.beginRead(),
		specialDays: specialDaysStore.beginRead(),
		assignments: dailyAssignmentsStore.beginRead()
	};
	return {
		...reads,
		close() {
			reads.availability.close();
			reads.specialDays.close();
			reads.assignments.close();
		}
	};
}

/** Applies each collection the read returned; a collection it did not request keeps its rows. */
export function mergeCalendarRangeIntoStores(orgId: string, data: CalendarRangeData, read: CalendarRangeRead): void {
	if (data.availabilityEntries) {
		availabilityStore.load(
			availabilityStore.orgId === orgId
				? read.availability.reconcile(data.availabilityEntries, rangeCoversSpan(data))
				: data.availabilityEntries,
			orgId
		);
	}
	if (data.specialDays) {
		specialDaysStore.load(
			specialDaysStore.orgId === orgId
				? read.specialDays.reconcile(data.specialDays, rangeCoversDate(data))
				: data.specialDays,
			orgId
		);
	}
	if (data.dailyAssignments) {
		dailyAssignmentsStore.load(
			dailyAssignmentsStore.types,
			dailyAssignmentsStore.orgId === orgId
				? read.assignments.reconcile(data.dailyAssignments, rangeCoversDate(data))
				: data.dailyAssignments,
			orgId
		);
	}
}

/**
 * Reads the assignments a duty picker needs for `firstDay` through `lastDay`, from the duty lookback before
 * them, into the shared stores. Nothing is written once the user has left the Organization lifetime the read
 * began in, even after returning to the same Organization, or once the stores belong to another Organization.
 */
export async function loadDutyHistory(orgId: string, days: { firstDay: string; lastDay: string }): Promise<void> {
	const current = stillInOrganizationLifetime();
	const read = beginCalendarRangeRead();
	try {
		const data = await loadCalendarRange(orgId, {
			rangeStart: fromDayNumber(toDayNumber(days.firstDay) - DUTY_LOOKBACK_DAYS),
			rangeEnd: days.lastDay,
			collections: ['assignments']
		});
		if (current() && dailyAssignmentsStore.orgId === orgId) mergeCalendarRangeIntoStores(orgId, data, read);
	} finally {
		read.close();
	}
}
