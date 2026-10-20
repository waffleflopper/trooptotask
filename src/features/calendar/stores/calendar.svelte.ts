/**
 * Calendar navigation store: the anchor date whose month both Calendar views start at.
 * `dates` returns every day of that month for the Month grid.
 *
 * The anchor cookie mirrors this month so the server bootstraps the month the viewer left.
 * The store starts from that cookie, so a reload shows the month the bootstrap holds.
 */
import { getMonthDates } from '$lib/utils/dates';
import { buildCalendarAnchorCookie, readCalendarAnchorCookie } from '../utils/calendarAnchorDate';

function firstOfMonth(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), 1);
}

const hasDocument = () => typeof document !== 'undefined';

function initialAnchor(): Date {
	const remembered = hasDocument() ? readCalendarAnchorCookie(document.cookie) : null;
	return firstOfMonth(remembered ?? new Date());
}

class CalendarStore {
	#currentDate = $state(initialAnchor());

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
		if (hasDocument()) document.cookie = buildCalendarAnchorCookie(this.#currentDate);
	}
}

export const calendarStore = new CalendarStore();
