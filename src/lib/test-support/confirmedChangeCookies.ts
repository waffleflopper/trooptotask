import { readConfirmedChangeCookies, type ConfirmedChangesByTab } from '$lib/stores/core';

/** What a request leaving now carries, as a workspace delivery echoes it back. */
export function confirmedChangesSentNow(): ConfirmedChangesByTab {
	return readConfirmedChangeCookies(
		document.cookie
			.split('; ')
			.filter(Boolean)
			.map((pair) => ({ name: pair.slice(0, pair.indexOf('=')), value: pair.slice(pair.indexOf('=') + 1) }))
	);
}
