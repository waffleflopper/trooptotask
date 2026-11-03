import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeHelp, openHelp, openHelpGuide, showHelpList, visibleUrl } from './helpNavigation';

type HelpState = { guide: string | null; depth: number };

const current = vi.hoisted(() => ({
	url: new URL('https://example.test/org/c-co/calendar?month=2026-03'),
	state: {} as { help?: HelpState | null },
	shallow: null as { url: URL } | null
}));
vi.mock('$app/state', () => ({
	get page() {
		return current;
	}
}));
const goto = vi.hoisted(() => vi.fn(async () => {}));
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

	it('returns from a guide to the list in place', () => {
		at('https://example.test/org/c-co/calendar?help=a', { guide: 'a', depth: 2 });
		showHelpList();
		expect(goto).toHaveBeenCalledWith('/org/c-co/calendar?help=', {
			shallow: true,
			replace: true,
			state: { help: { guide: null, depth: 2 } }
		});
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

	it('still steps back over both entries after returning from a guide to the list', () => {
		const go = vi.fn();
		vi.stubGlobal('history', { go });
		at('https://example.test/org/c-co/calendar?help=a', { guide: 'a', depth: 2 });
		showHelpList();
		current.state = { help: { guide: null, depth: 2 } };
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
