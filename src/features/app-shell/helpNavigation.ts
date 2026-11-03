import { goto } from '$app/navigation';
import { page } from '$app/state';
import { HELP_PARAM, helpLocation, type HelpPageUrl } from '$features/help/contracts';

/**
 * Help lives in history as shallow entries. A Help button press pushes the list, a guide opened from the list pushes
 * one more, and closing steps back over both. A guide pushed from the list returns to it by stepping back, so the list
 * stays one entry. A page loaded on `?help` or reached through a step's link has no such entries, so there Help
 * changes the URL in place and closing only drops the param.
 */

/** The address bar's URL. During a shallow entry `page.url` is still the page that was loaded, not the one shown. */
export function visibleUrl(): HelpPageUrl {
	return page.shallow?.url ?? page.url;
}

/** The history entries Help pushed above the page it was opened from. */
function helpDepth(): number {
	return page.state.help?.depth ?? 0;
}

export function openHelp() {
	void goto(helpLocation(visibleUrl(), ''), { shallow: true, state: { help: { guide: null, depth: 1 } } });
}

/** From a pushed list a guide takes a new entry, so Back returns to the list. Anywhere else it takes the current one. */
export function openHelpGuide(id: string) {
	const depth = helpDepth();
	const push = depth > 0 && page.state.help?.guide === null;
	void goto(helpLocation(visibleUrl(), id), {
		shallow: true,
		replace: !push,
		state: depth > 0 ? { help: { guide: id, depth: push ? depth + 1 : depth } } : {}
	});
}

/** A guide pushed from the list sits one entry above it, so the list is one step back. Elsewhere the URL changes in place. */
export function showHelpList() {
	const depth = helpDepth();
	if (depth >= 2 && page.state.help?.guide) {
		history.back();
		return;
	}
	void goto(helpLocation(visibleUrl(), ''), {
		shallow: true,
		replace: true,
		state: depth > 0 ? { help: { guide: null, depth } } : {}
	});
}

export function closeHelp() {
	const depth = helpDepth();
	if (depth > 0) history.go(-depth);
	else void goto(helpLocation(visibleUrl(), undefined), { shallow: true, replace: true, state: { help: null } });
}

type HelpState = NonNullable<App.PageState['help']>;

let lastHelp: { pathname: string; help: HelpState } | null = null;

/**
 * `invalidate()` resets `page.state` unless the caller opts out, and the app invalidates after most saves. The shallow
 * entry survives, so the URL still shows Help but its history depth is gone. This remembers the last Help state and puts
 * it back while the shallow entry for the same path remains. A navigation drops the shallow entry, so a step's link
 * to the same page is never mistaken for a reset.
 */
export function keepHelpState() {
	const help = page.state.help;
	const url = visibleUrl();
	if (help) {
		lastHelp = { pathname: url.pathname, help };
		return;
	}
	const lost =
		help === undefined &&
		page.shallow !== null &&
		lastHelp?.pathname === url.pathname &&
		url.searchParams.has(HELP_PARAM);
	if (lost) {
		void goto(`${url.pathname}${url.search}${url.hash}`, {
			shallow: true,
			replace: true,
			state: { help: lastHelp!.help }
		});
		return;
	}
	lastHelp = null;
}
