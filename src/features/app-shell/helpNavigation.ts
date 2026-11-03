import { goto } from '$app/navigation';
import { page } from '$app/state';
import { helpLocation } from '$features/help/contracts';

/**
 * Help lives in history as shallow entries. A Help button press pushes the list, a guide opened from the list pushes
 * one more, and closing steps back over both. A page loaded on `?help` or reached through a step's link has no such
 * entries, so there Help changes the URL in place and closing only drops the param.
 */

/** The entries Help added above the page it was opened from. */
function helpEntries(): number {
	const view = page.state.help;
	if (!view) return 0;
	return view.guide === null ? 1 : 2;
}

export function openHelp() {
	void goto(helpLocation(page.url, ''), { shallow: true, state: { help: { guide: null } } });
}

/** From the stacked list a guide takes a new entry, so Back returns to the list. Anywhere else it takes the current one. */
export function openHelpGuide(id: string) {
	const stacked = helpEntries() > 0;
	const fromList = page.state.help?.guide === null;
	void goto(helpLocation(page.url, id), {
		shallow: true,
		replace: !fromList,
		state: stacked ? { help: { guide: id } } : {}
	});
}

export function showHelpList() {
	const stacked = helpEntries() > 0;
	void goto(helpLocation(page.url, ''), {
		shallow: true,
		replace: true,
		state: stacked ? { help: { guide: null } } : {}
	});
}

export function closeHelp() {
	const entries = helpEntries();
	if (entries > 0) history.go(-entries);
	else void goto(helpLocation(page.url, undefined), { shallow: true, replace: true, state: { help: null } });
}
