import { goto } from '$app/navigation';
import { page } from '$app/state';
import { helpLocation, type HelpPageUrl } from '$features/help/contracts';

/**
 * Help lives in history as shallow entries. A Help button press pushes the list, a guide opened from the list pushes
 * one more, and closing steps back over both. A page loaded on `?help` or reached through a step's link has no such
 * entries, so there Help changes the URL in place and closing only drops the param.
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

export function showHelpList() {
	const depth = helpDepth();
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
