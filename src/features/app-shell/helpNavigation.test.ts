import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeHelp, keepHelpState, openHelp, openHelpGuide, showHelpList } from './helpNavigation';
import { visibleUrl } from '$lib/utils/visibleUrl';

type HelpState = { guide: string | null; depth: number };
type GotoOptions = { replace?: boolean; state?: { help?: HelpState | null } };

const current = vi.hoisted(() => ({
	url: new URL('https://example.test/org/c-co/calendar?month=2026-03'),
	state: {} as { help?: HelpState | null; importStep?: 'columns' | 'review' | 'done' },
	shallow: null as { url: URL } | null
}));
vi.mock('$app/state', () => ({
	get page() {
		return current;
	}
}));
const goto = vi.hoisted(() => vi.fn<(url: string, options: GotoOptions) => Promise<void>>(async () => {}));
vi.mock('$app/navigation', () => ({ goto }));

function at(url: string, help?: HelpState | null) {
	current.url = new URL(url);
	current.shallow = null;
	current.state = help === undefined ? {} : { help };
}

/** A shallow entry: the address bar shows `visible` while `page.url` is still the loaded page. */
function atShallow(loaded: string, visible: string, help: HelpState) {
	at(loaded);
	current.shallow = { url: new URL(visible) };
	current.state = { help };
}

afterEach(() => {
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

describe('opening Help', () => {
	it('keeps the page state, such as an import step, when Help opens and closes in place', () => {
		at('https://example.test/org/c-co/personnel/import');
		current.state = { importStep: 'review' };
		openHelp();
		expect(goto).toHaveBeenLastCalledWith('/org/c-co/personnel/import?help=', {
			shallow: true,
			state: { importStep: 'review', help: { guide: null, depth: 1 } }
		});
		at('https://example.test/org/c-co/personnel/import?help=a');
		current.state = { importStep: 'review' };
		closeHelp();
		expect(goto).toHaveBeenLastCalledWith('/org/c-co/personnel/import', {
			shallow: true,
			replace: true,
			state: { importStep: 'review', help: null }
		});
	});

	it('pushes the guide list onto history without leaving the page', () => {
		at('https://example.test/org/c-co/calendar?month=2026-03');
		openHelp();
		expect(goto).toHaveBeenCalledWith('/org/c-co/calendar?month=2026-03&help=', {
			shallow: true,
			state: { help: { guide: null, depth: 1 } }
		});
	});

	it('pushes a guide opened from the list, so Back returns to the list', () => {
		at('https://example.test/org/c-co/calendar?help=', { guide: null, depth: 1 });
		openHelpGuide('print-da6');
		expect(goto).toHaveBeenCalledWith('/org/c-co/calendar?help=print-da6', {
			shallow: true,
			replace: false,
			state: { help: { guide: 'print-da6', depth: 2 } }
		});
	});

	it('swaps one guide for the next in place', () => {
		at('https://example.test/org/c-co/calendar?help=a', { guide: 'a', depth: 2 });
		openHelpGuide('b');
		expect(goto).toHaveBeenCalledWith('/org/c-co/calendar?help=b', {
			shallow: true,
			replace: true,
			state: { help: { guide: 'b', depth: 2 } }
		});
	});

	it('changes a page that was loaded on the param in place and adds no state', () => {
		at('https://example.test/org/c-co/calendar?help=');
		openHelpGuide('a');
		expect(goto).toHaveBeenCalledWith('/org/c-co/calendar?help=a', { shallow: true, replace: true, state: {} });
	});

	it('returns from a guide pushed from the list by stepping back to it', () => {
		const back = vi.fn();
		vi.stubGlobal('history', { back });
		at('https://example.test/org/c-co/calendar?help=a', { guide: 'a', depth: 2 });
		showHelpList();
		expect(back).toHaveBeenCalledOnce();
		expect(goto).not.toHaveBeenCalled();
	});

	it('returns to the list in place when the page was loaded on a guide', () => {
		at('https://example.test/org/c-co/calendar?help=a');
		showHelpList();
		expect(goto).toHaveBeenCalledWith('/org/c-co/calendar?help=', { shallow: true, replace: true, state: {} });
	});
});

describe('Help over a shallow entry', () => {
	it('builds from the address bar URL, not the page that was loaded', () => {
		atShallow('https://example.test/org/c-co/calendar', 'https://example.test/org/c-co/calendar?help=a#top', {
			guide: 'a',
			depth: 2
		});
		openHelpGuide('b');
		expect(goto).toHaveBeenCalledWith('/org/c-co/calendar?help=b#top', expect.anything());
		expect(visibleUrl().search).toBe('?help=a');
	});
});

describe('closing Help', () => {
	it('steps back over the one entry the list added', () => {
		const go = vi.fn();
		vi.stubGlobal('history', { go });
		at('https://example.test/org/c-co/calendar?help=', { guide: null, depth: 1 });
		closeHelp();
		expect(go).toHaveBeenCalledWith(-1);
		expect(goto).not.toHaveBeenCalled();
	});

	it('steps back over the list and the guide together', () => {
		const go = vi.fn();
		vi.stubGlobal('history', { go });
		at('https://example.test/org/c-co/calendar?help=a', { guide: 'a', depth: 2 });
		closeHelp();
		expect(go).toHaveBeenCalledWith(-2);
	});

	it('drops the param in place when the page was loaded on it', () => {
		const go = vi.fn();
		vi.stubGlobal('history', { go });
		at('https://example.test/org/c-co/calendar?month=2026-03&help=a');
		closeHelp();
		expect(go).not.toHaveBeenCalled();
		expect(goto).toHaveBeenCalledWith('/org/c-co/calendar?month=2026-03', {
			shallow: true,
			replace: true,
			state: { help: null }
		});
	});
});

/** A browser history stack that applies what helpNavigation asks of `goto` and `history`. */
function browserHistory(startUrl: string) {
	type Entry = { url: string; state: { help?: HelpState | null } };
	const entries: Entry[] = [{ url: startUrl, state: {} }];
	let index = 0;
	const show = () => {
		current.url = new URL(entries[index].url, 'https://example.test');
		current.shallow = null;
		current.state = entries[index].state;
	};
	goto.mockImplementation(async (url, options) => {
		const entry = { url, state: options.state ?? {} };
		if (options.replace) entries[index] = entry;
		else entries.splice(index + 1, entries.length, entry);
		if (!options.replace) index += 1;
		show();
	});
	const go = (delta: number) => {
		index += delta;
		show();
	};
	vi.stubGlobal('history', { go, back: () => go(-1) });
	show();
	return {
		back: () => go(-1),
		get urls() {
			return entries.map((entry) => entry.url);
		},
		/** The entries from the first page up to the one showing, which Back would have to cross to leave. */
		get depth() {
			return index + 1;
		},
		get here() {
			return entries[index].url;
		}
	};
}

describe('Help across a whole visit', () => {
	const page0 = 'https://example.test/org/c-co/calendar';

	it('steps Back guide, then list, then closed after the crumb and a second guide', () => {
		const browser = browserHistory(page0);
		openHelp();
		openHelpGuide('a');
		showHelpList();
		expect(browser.here).toBe('/org/c-co/calendar?help=');
		openHelpGuide('b');
		expect(browser.here).toBe('/org/c-co/calendar?help=b');

		browser.back();
		expect(browser.here).toBe('/org/c-co/calendar?help=');
		browser.back();
		expect(browser.here).toBe(page0);
	});

	it('does not grow history when the crumb and a new guide are repeated', () => {
		const browser = browserHistory(page0);
		openHelp();
		for (const id of ['a', 'b', 'c']) {
			openHelpGuide(id);
			showHelpList();
		}
		expect(browser.depth).toBe(2);
		expect(browser.here).toBe('/org/c-co/calendar?help=');
	});

	it('closes over every pushed entry from a guide reached with Next', () => {
		const browser = browserHistory(page0);
		openHelp();
		openHelpGuide('a');
		openHelpGuide('b');
		closeHelp();
		expect(browser.here).toBe(page0);
	});

	it('closes over every pushed entry from a revisited list', () => {
		const browser = browserHistory(page0);
		openHelp();
		openHelpGuide('a');
		showHelpList();
		closeHelp();
		expect(browser.here).toBe(page0);
	});
});

describe('Help after an invalidation resets the page state', () => {
	beforeEach(() => vi.stubGlobal('history', { length: 3 }));

	const guide = { guide: 'a', depth: 2 };

	/** What `invalidate()` leaves behind: the shallow entry and its URL, without the state. */
	function invalidated(visible: string) {
		current.shallow = { url: new URL(visible) };
		current.state = {};
	}

	it('puts the remembered state back on the same shallow entry', () => {
		atShallow('https://example.test/org/c-co/calendar', 'https://example.test/org/c-co/calendar?help=a', guide);
		keepHelpState();
		expect(goto).not.toHaveBeenCalled();

		invalidated('https://example.test/org/c-co/calendar?help=a');
		keepHelpState();
		expect(goto).toHaveBeenCalledWith('/org/c-co/calendar?help=a', {
			shallow: true,
			replace: true,
			state: { help: guide }
		});
	});

	it('does not restore over a new entry the page pushed, such as the next import step', () => {
		vi.stubGlobal('history', { length: 3 });
		atShallow(
			'https://example.test/org/c-co/personnel/import',
			'https://example.test/org/c-co/personnel/import?help=a',
			guide
		);
		keepHelpState();

		vi.stubGlobal('history', { length: 4 });
		invalidated('https://example.test/org/c-co/personnel/import?help=a');
		keepHelpState();
		expect(goto).not.toHaveBeenCalled();
	});

	it('does not restore after a navigation to another path', () => {
		atShallow('https://example.test/org/c-co/calendar', 'https://example.test/org/c-co/calendar?help=a', guide);
		keepHelpState();

		at('https://example.test/org/c-co/personnel?help=a');
		keepHelpState();
		expect(goto).not.toHaveBeenCalled();
	});

	it('does not restore a step link to the same page, which leaves the shallow entry', () => {
		atShallow('https://example.test/org/c-co/calendar', 'https://example.test/org/c-co/calendar?help=a', guide);
		keepHelpState();

		at('https://example.test/org/c-co/calendar?help=a&section=assignments');
		keepHelpState();
		expect(goto).not.toHaveBeenCalled();
	});

	it('does not restore once Help was closed', () => {
		atShallow('https://example.test/org/c-co/calendar', 'https://example.test/org/c-co/calendar?help=a', guide);
		keepHelpState();

		at('https://example.test/org/c-co/calendar', null);
		keepHelpState();
		invalidated('https://example.test/org/c-co/calendar?help=a');
		keepHelpState();
		expect(goto).not.toHaveBeenCalled();
	});
});
