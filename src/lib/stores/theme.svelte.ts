import { browser } from '$app/environment';

class ThemeStore {
	#theme = $state<'light' | 'dark'>('light');

	constructor() {
		if (browser) {
			const stored = localStorage.getItem('theme');
			if (stored === 'dark' || stored === 'light') {
				this.#theme = stored;
			} else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
				this.#theme = 'dark';
			}
		}
	}

	get current() {
		return this.#theme;
	}

	get isDark() {
		return this.#theme === 'dark';
	}

	toggle() {
		this.#theme = this.#theme === 'light' ? 'dark' : 'light';
		if (browser) {
			localStorage.setItem('theme', this.#theme);
			this.applyToDocument();
		}
	}

	setTheme(theme: 'light' | 'dark') {
		this.#theme = theme;
		if (browser) {
			localStorage.setItem('theme', this.#theme);
			this.applyToDocument();
		}
	}

	applyToDocument() {
		if (browser) {
			document.documentElement.setAttribute('data-theme', this.#theme);
		}
	}

	init() {
		if (browser) {
			const stored = localStorage.getItem('theme');
			if (stored === 'dark' || stored === 'light') {
				this.#theme = stored;
			} else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
				this.#theme = 'dark';
			}
			this.applyToDocument();
		}
	}
}

export const themeStore = new ThemeStore();
