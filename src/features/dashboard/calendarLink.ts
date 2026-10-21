import { calendarStore } from '$features/calendar';

/** The Calendar opens on the month it was last left in, so a link to a day moves it to that month first. */
export function openCalendarAt(day: string): void {
	calendarStore.goToMonth(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1);
}
