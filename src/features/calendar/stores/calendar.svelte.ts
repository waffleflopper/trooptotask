/**
 * Calendar navigation store: the anchor date whose month both Calendar views start at.
 * `dates` returns every day of that month for the Month grid.
 */
import { getMonthDates } from '$lib/utils/dates';

function firstOfCurrentMonth(): Date {
	const today = new Date();
	return new Date(today.getFullYear(), today.getMonth(), 1);
}

class CalendarStore {
	#currentDate = $state(firstOfCurrentMonth());

	get currentDate() {
		return this.#currentDate;
	}

	get year() {
		return this.#currentDate.getFullYear();
	}

	get month() {
		return this.#currentDate.getMonth();
	}

	get dates() {
		return getMonthDates(this.#currentDate.getFullYear(), this.#currentDate.getMonth());
	}

	goToMonth(year: number, month: number) {
		this.#currentDate = new Date(year, month, 1);
	}
}

export const calendarStore = new CalendarStore();
