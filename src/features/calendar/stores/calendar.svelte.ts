/**
 * Calendar navigation store: the anchor date whose month both Calendar views start at.
 * `dates` returns every day of that month for the Month grid.
 */
import { getMonthDates } from '$lib/utils/dates';

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

	get dates() {
		return getMonthDates(this.#currentDate.getFullYear(), this.#currentDate.getMonth());
	}

	goToMonth(year: number, month: number) {
		this.#currentDate = new Date(year, month, 1);
	}
}

export const calendarStore = new CalendarStore();
