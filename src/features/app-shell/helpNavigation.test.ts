import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HelpView } from '$features/help/contracts';
import { closeHelp, openHelp, openHelpGuide, showHelpList } from './helpNavigation';

const current = vi.hoisted(() => ({
	url: new URL('https://example.test/org/c-co/calendar?month=2026-03'),
	state: {} as { help?: { guide: string | null } | null }
}));
vi.mock('$app/state', () => ({
	get page() {
		return current;
	}
}));
const goto = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('$app/navigation', () => ({ goto }));

function at(url: string, help?: HelpView | null) {
	current.url = new URL(url);
	current.state = help === undefined ? {} : { help };
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
			state: { help: { guide: null } }
		});
	});

	it('pushes a guide opened from the list, so Back returns to the list', () => {
		at('https://example.test/org/c-co/calendar?help=', { guide: null });
		openHelpGuide('print-da6');
		expect(goto).toHaveBeenCalledWith('/org/c-co/calendar?help=print-da6', {
			shallow: true,
			replace: false,
			state: { help: { guide: 'print-da6' } }
		});
	});

	it('swaps one guide for the next in place', () => {
		at('https://example.test/org/c-co/calendar?help=a', { guide: 'a' });
		openHelpGuide('b');
		expect(goto).toHaveBeenCalledWith('/org/c-co/calendar?help=b', {
			shallow: true,
			replace: true,
			state: { help: { guide: 'b' } }
		});
	});

	it('changes a page that was loaded on the param in place and adds no state', () => {
		at('https://example.test/org/c-co/calendar?help=');
		openHelpGuide('a');
		expect(goto).toHaveBeenCalledWith('/org/c-co/calendar?help=a', { shallow: true, replace: true, state: {} });
	});

	it('returns from a guide to the list in place', () => {
		at('https://example.test/org/c-co/calendar?help=a', { guide: 'a' });
		showHelpList();
		expect(goto).toHaveBeenCalledWith('/org/c-co/calendar?help=', {
			shallow: true,
			replace: true,
			state: { help: { guide: null } }
		});
	});
});

describe('closing Help', () => {
	it('steps back over the one entry the list added', () => {
		const go = vi.fn();
		vi.stubGlobal('history', { go });
		at('https://example.test/org/c-co/calendar?help=', { guide: null });
		closeHelp();
		expect(go).toHaveBeenCalledWith(-1);
		expect(goto).not.toHaveBeenCalled();
	});

	it('steps back over the list and the guide together', () => {
		const go = vi.fn();
		vi.stubGlobal('history', { go });
		at('https://example.test/org/c-co/calendar?help=a', { guide: 'a' });
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
