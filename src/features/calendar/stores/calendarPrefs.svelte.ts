/**
 * Calendar preferences store — per-user display settings persisted to localStorage.
 *
 * Currently stores `showStatusText` (whether availability status labels are shown inline
 * on calendar cells vs. icon-only). Persisted under key `'calendar-prefs'`.
 * Loaded automatically on construction in the browser.
 */
import { browser } from '$app/environment';

const STORAGE_KEY = 'calendar-prefs';

interface CalendarPrefs {
	showStatusText: boolean;
}

const defaults: CalendarPrefs = {
	showStatusText: false
};

class CalendarPrefsStore {
	#prefs = $state<CalendarPrefs>({ ...defaults });

	constructor() {
		if (browser) {
			this.load();
		}
	}

	private load() {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				const parsed = JSON.parse(stored);
				this.#prefs = { ...defaults, ...parsed };
			}
		} catch {
			// Ignore parse errors, use defaults
		}
	}

	private save() {
		if (browser) {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#prefs));
		}
	}

	get showStatusText() {
		return this.#prefs.showStatusText;
	}

	set showStatusText(value: boolean) {
		this.#prefs.showStatusText = value;
		this.save();
	}

	toggleShowStatusText() {
		this.showStatusText = !this.#prefs.showStatusText;
	}
}

export const calendarPrefsStore = new CalendarPrefsStore();
