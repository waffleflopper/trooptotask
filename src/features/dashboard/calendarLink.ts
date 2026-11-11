import { calendarStore } from '$features/calendar';
import { parseDate } from '$lib/utils/dates';

/** The Calendar opens where it was last left, so a link to a day moves it to that day first. */
export function openCalendarAt(day: string): void {
	calendarStore.goToDay(parseDate(day));
}
