import { page } from '$app/state';

/** The address bar's URL. During a shallow entry `page.url` is still the page that was loaded, not the one shown. */
export function visibleUrl(): typeof page.url {
	return page.shallow?.url ?? page.url;
}
