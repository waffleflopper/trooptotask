/**
 * The Calendar focuses one day. Month views show its month and week views its Monday-start week, so
 * `currentDate` stays the first of that month for every consumer that thinks in months.
 * The anchor cookie mirrors the month so the server bootstraps the month the viewer left.
 * The store starts from that cookie, so a reload shows the month the bootstrap holds, and on today
 * when the remembered month contains it.
 */
import { getMonthDates } from '$lib/utils/dates';
import { buildCalendarAnchorCookie, readCalendarAnchorCookie } from '../utils/calendarAnchorDate';
import { weekDates } from '../utils/calendarRange';

function firstOfMonth(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), 1);
}

function dayOf(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

const hasDocument = () => typeof document !== 'undefined';

function initialFocusDay(): Date {
	const today = dayOf(new Date());
	const remembered = hasDocument() ? readCalendarAnchorCookie(document.cookie) : null;
	if (!remembered || isSameMonth(remembered, today)) return today;
	return firstOfMonth(remembered);
}

function isSameMonth(a: Date, b: Date): boolean {
	return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

class CalendarStore {
	#focusDay = $state(initialFocusDay());
	// Keyed by the month alone, so moving within a month leaves the month's derivations alone.
	readonly #monthIndex = $derived(this.#focusDay.getFullYear() * 12 + this.#focusDay.getMonth());
	readonly #currentDate = $derived(new Date(Math.floor(this.#monthIndex / 12), this.#monthIndex % 12, 1));
	readonly #dates = $derived(getMonthDates(this.#currentDate.getFullYear(), this.#currentDate.getMonth()));
	readonly #weekDates = $derived(weekDates(this.#focusDay));

	get focusDay() {
		return this.#focusDay;
	}

	/** The first of the focus day's month. */
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
		return this.#dates;
	}

	/** The seven days of the focus day's Monday-start week. */
	get weekDates() {
		return this.#weekDates;
	}

	goToDay(date: Date) {
		this.#focusDay = dayOf(date);
		if (hasDocument()) document.cookie = buildCalendarAnchorCookie(firstOfMonth(this.#focusDay));
	}

	goToMonth(year: number, month: number) {
		this.goToDay(new Date(year, month, 1));
	}
}

export const calendarStore = new CalendarStore();
