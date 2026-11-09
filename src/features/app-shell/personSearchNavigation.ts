import { page } from '$app/state';
import { writeAddress } from '$lib/utils/addressWriter';

/**
 * The person search palette lives in history as one shallow entry, so Back closes it. Closing steps back over that
 * entry. Opening a record first closes the palette, then navigates, so Back from the record returns to the page the
 * palette was opened on. Replacing the shallow entry with the record would leave the page under it stale after Back,
 * because SvelteKit gives a shallow entry its page's navigation index.
 */

export function isPersonSearchOpen(): boolean {
	return page.state.personSearch === true;
}

export function openPersonSearch() {
	if (!isPersonSearchOpen()) void writeAddress({ push: true, state: { ...page.state, personSearch: true } });
}

// history.back() lands on a later popstate, so a second close before then must not step back past the page.
let closingFrom: App.PageState | null = null;

export function closePersonSearch() {
	if (!isPersonSearchOpen() || closingFrom === page.state) return;
	closingFrom = page.state;
	history.back();
}

export function togglePersonSearch() {
	if (isPersonSearchOpen()) closePersonSearch();
	else openPersonSearch();
}
