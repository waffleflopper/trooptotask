import { goto } from '$app/navigation';
import { page } from '$app/state';

/** The address bar's URL. During a shallow entry `page.url` is still the page that was loaded, not the one shown. */
export function visibleUrl(): typeof page.url {
	return page.shallow?.url ?? page.url;
}

/**
 * Puts one search param on the address bar in place, so a reload or shared link keeps the page's view. It is a shallow
 * replace that carries `page.state`, so an open drawer keeps its history, and it leaves scroll and focus alone.
 */
export function replaceVisibleSearchParam(name: string, value: string) {
	const url = new URL(visibleUrl().href);
	url.searchParams.set(name, value);
	void goto(`${url.pathname}${url.search}${url.hash}`, { shallow: true, replace: true, state: page.state });
}
