import { goto, pushState } from '$app/navigation';
import { page } from '$app/state';

/**
 * The person search palette lives in history as one shallow entry, so Back closes it. Closing steps back over that
 * entry. Opening a record replaces it, so Back from the record returns to the page the palette was opened on.
 */

export function isPersonSearchOpen(): boolean {
	return page.state.personSearch === true;
}

export function openPersonSearch() {
	if (!isPersonSearchOpen()) void pushState('', { ...page.state, personSearch: true });
}

export function closePersonSearch() {
	if (isPersonSearchOpen()) history.back();
}

export function togglePersonSearch() {
	if (isPersonSearchOpen()) closePersonSearch();
	else openPersonSearch();
}

/** Resolves when the record has loaded or the navigation was abandoned. */
export function openPersonFromSearch(href: string): Promise<void> {
	return goto(href, { replaceState: true });
}
