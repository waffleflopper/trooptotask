/**
 * Calendar navigation store — tracks the currently displayed month and exposes navigation.
 *
 * `dates` returns the full array of Date objects for the current month (used to render
 * calendar grid rows). `rangeStart`/`rangeEnd` are ISO strings for the visible window,
 * used as query parameters when fetching availability and assignment data.
 *
 * Navigation: `nextMonth()`, `prevMonth()`, `goToToday()`.
 */
import { getMonthDates, addMonths, getMonthName } from '$lib/utils/dates';

class CalendarStore {
	#currentDate = $state(new Date());

	get currentDate() {
		return this.#currentDate;
	}

	get year() {
		return this.#currentDate.getFullYear();
	}

	get month() {
		return this.#currentDate.getMonth();
	}

	get monthName() {
		return getMonthName(this.#currentDate.getMonth());
	}

	get dates() {
		return getMonthDates(this.#currentDate.getFullYear(), this.#currentDate.getMonth());
	}

	nextMonth() {
		this.#currentDate = addMonths(this.#currentDate, 1);
	}

	prevMonth() {
		this.#currentDate = addMonths(this.#currentDate, -1);
	}

	goToToday() {
		this.#currentDate = new Date();
	}

	goToMonth(year: number, month: number) {
		this.#currentDate = new Date(year, month, 1);
	}
}

export const calendarStore = new CalendarStore();
