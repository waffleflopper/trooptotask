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
