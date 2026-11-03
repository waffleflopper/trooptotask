import { goto } from '$app/navigation';
import { page } from '$app/state';
import { visibleUrl } from '$lib/utils/visibleUrl';
import { HELP_PARAM, helpLocation } from '$features/help/contracts';

/**
 * Help lives in history as shallow entries. A Help button press pushes the list, a guide opened from the list pushes
 * one more, and closing steps back over both. A guide pushed from the list returns to it by stepping back, so the list
 * stays one entry. A page loaded on `?help` or reached through a step's link has no such entries, so there Help
 * changes the URL in place and closing only drops the param.
 */

/** The history entries Help pushed above the page it was opened from. */
function helpDepth(): number {
	return page.state.help?.depth ?? 0;
}

/** Help shares `page.state` with the page under it, such as an import's step, so its writes keep the other fields. */
function withHelp(help: App.PageState['help']): App.PageState {
	return { ...page.state, help };
}

export function openHelp() {
	void goto(helpLocation(visibleUrl(), ''), { shallow: true, state: withHelp({ guide: null, depth: 1 }) });
}

/** From a pushed list a guide takes a new entry, so Back returns to the list. Anywhere else it takes the current one. */
export function openHelpGuide(id: string) {
	const depth = helpDepth();
	const push = depth > 0 && page.state.help?.guide === null;
	void goto(helpLocation(visibleUrl(), id), {
		shallow: true,
		replace: !push,
		state: withHelp(depth > 0 ? { guide: id, depth: push ? depth + 1 : depth } : undefined)
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
		state: withHelp(depth > 0 ? { guide: null, depth } : undefined)
	});
}

/** The page view a close should land on. A tab the page switched while Help was open lives only in Help's entries. */
let closingTo: string | null = null;

export function closeHelp() {
	const depth = helpDepth();
	const view = helpLocation(visibleUrl(), undefined);
	if (depth === 0) {
		void goto(view, { shallow: true, replace: true, state: withHelp(null) });
		return;
	}
	closingTo = view;
	history.go(-depth);
}

type HelpState = NonNullable<App.PageState['help']>;

let lastHelp: { pathname: string; entries: number; help: HelpState } | null = null;

/**
 * `invalidate()` resets `page.state` unless the caller opts out, and the app invalidates after most saves. The shallow
 * entry survives, so the URL still shows Help but its history depth is gone. This remembers the last Help state and puts
 * it back while the shallow entry for the same path remains. A navigation drops the shallow entry, so a step's link
 * to the same page is never mistaken for a reset, and a page's own history push, such as an import moving to its next
 * step, adds an entry, so it is not mistaken for one either. It also finishes a close: SvelteKit applies the page entry
 * after an await, so the view the page changed to under Help is put back here, once Help's state is gone.
 */
export function keepHelpState() {
	const help = page.state.help;
	const url = visibleUrl();
	if (closingTo !== null && !help) {
		const view = closingTo;
		closingTo = null;
		lastHelp = null;
		if (helpLocation(url, undefined) !== view) void goto(view, { shallow: true, replace: true, state: page.state });
		return;
	}
	if (help) {
		lastHelp = { pathname: url.pathname, entries: history.length, help };
		return;
	}
	const lost =
		help === undefined &&
		page.shallow !== null &&
		lastHelp?.pathname === url.pathname &&
		lastHelp.entries === history.length &&
		url.searchParams.has(HELP_PARAM);
	if (lost) {
		void goto(`${url.pathname}${url.search}${url.hash}`, {
			shallow: true,
			replace: true,
			state: withHelp(lastHelp!.help)
		});
		return;
	}
	lastHelp = null;
}
