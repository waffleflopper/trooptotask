import { describe, expect, it } from 'vitest';
import { fitToolbar, type FitInput, type MeasuredItem } from './fit-toolbar.js';

const ranked: MeasuredItem[] = [
	{ id: 'v', width: 80, section: 'view', menuOnly: false },
	{ id: 'f1', width: 60, section: 'filters', menuOnly: false },
	{ id: 'f2', width: 50, section: 'filters', menuOnly: false },
	{ id: 'a1', width: 90, section: 'actions', menuOnly: false },
	{ id: 'a2', width: 70, section: 'actions', menuOnly: false }
];

function input(available: number, overrides: Partial<FitInput> = {}): FitInput {
	return {
		available,
		gap: 10,
		pinnedWidth: 100,
		moreWidth: 32,
		searchMinWidth: 160,
		searchIconWidth: 32,
		items: ranked,
		...overrides
	} as FitInput;
}

const noSearch = { searchMinWidth: null, searchIconWidth: null } as const;
const a2MenuOnly = ranked.map((item) => (item.id === 'a2' ? { ...item, menuOnly: true } : item));

describe('fitToolbar', () => {
	it.each([
		[670, ['v', 'f1', 'f2', 'a1', 'a2'], false],
		[669, ['v', 'f1', 'f2', 'a1'], false],
		[632, ['v', 'f1', 'f2', 'a1'], false],
		[631, ['v', 'f1', 'f2'], false],
		[531, ['v', 'f1'], false],
		[471, ['v'], false],
		[401, [], false],
		[312, [], false],
		[311, [], true]
	])('at %ipx keeps %j on the row with search collapsed %s', (available, visibleIds, searchCollapsed) => {
		expect(fitToolbar(input(available))).toEqual({ visibleIds, searchCollapsed });
	});

	it('counts More from the start when a menu-only item exists and never puts that item on the row', () => {
		expect(fitToolbar(input(632, { items: a2MenuOnly }))).toEqual({
			visibleIds: ['v', 'f1', 'f2', 'a1'],
			searchCollapsed: false
		});
		expect(fitToolbar(input(900, { items: a2MenuOnly }))).toEqual({
			visibleIds: ['v', 'f1', 'f2', 'a1'],
			searchCollapsed: false
		});
		expect(fitToolbar(input(631, { items: a2MenuOnly }))).toEqual({
			visibleIds: ['v', 'f1', 'f2'],
			searchCollapsed: false
		});
	});

	it('counts gaps only between controls that exist', () => {
		expect(fitToolbar(input(270, { items: [] }))).toEqual({ visibleIds: [], searchCollapsed: false });
		expect(fitToolbar(input(269, { items: [] }))).toEqual({ visibleIds: [], searchCollapsed: true });
		expect(fitToolbar(input(0, { items: [], pinnedWidth: 0, ...noSearch }))).toEqual({
			visibleIds: [],
			searchCollapsed: false
		});
		const single = [{ id: 'only', width: 50, section: 'actions', menuOnly: false }] satisfies MeasuredItem[];
		expect(fitToolbar(input(50, { items: single, pinnedWidth: 0, ...noSearch }))).toEqual({
			visibleIds: ['only'],
			searchCollapsed: false
		});
	});

	it('folds without search at its own thresholds', () => {
		expect(fitToolbar(input(500, noSearch))).toEqual({
			visibleIds: ['v', 'f1', 'f2', 'a1', 'a2'],
			searchCollapsed: false
		});
		expect(fitToolbar(input(499, noSearch))).toEqual({ visibleIds: ['v', 'f1', 'f2', 'a1'], searchCollapsed: false });
		expect(fitToolbar(input(461, noSearch))).toEqual({ visibleIds: ['v', 'f1', 'f2'], searchCollapsed: false });
	});

	it('gives the same result for a width regardless of the widths computed before it', () => {
		const first = fitToolbar(input(631));
		fitToolbar(input(311));
		fitToolbar(input(670));
		expect(fitToolbar(input(631))).toEqual(first);
		expect(first).toEqual({ visibleIds: ['v', 'f1', 'f2'], searchCollapsed: false });
	});

	it('folds a highly ranked action before a low-ranked view', () => {
		const interleaved: MeasuredItem[] = [
			{ id: 'top-action', width: 90, section: 'actions', menuOnly: false },
			{ id: 'filter', width: 60, section: 'filters', menuOnly: false },
			{ id: 'view', width: 80, section: 'view', menuOnly: false }
		];
		// Full row: 230 items + 100 + 160 + 4 gaps = 530. Folding the action: 140 + 100 + 160 + 32 + 40 = 472.
		expect(fitToolbar(input(529, { items: interleaved }))).toEqual({
			visibleIds: ['filter', 'view'],
			searchCollapsed: false
		});
		// Folding the filter next: 80 + 100 + 160 + 32 + 30 = 402.
		expect(fitToolbar(input(471, { items: interleaved }))).toEqual({ visibleIds: ['view'], searchCollapsed: false });
	});

	it('keeps an exactly fitting fractional row unfolded', () => {
		const fractional: MeasuredItem[] = [
			{ id: 'x', width: 80.5, section: 'filters', menuOnly: false },
			{ id: 'y', width: 60.25, section: 'actions', menuOnly: false }
		];
		const base = { items: fractional, pinnedWidth: 0, gap: 6, ...noSearch };
		expect(fitToolbar(input(146.75, base))).toEqual({ visibleIds: ['x', 'y'], searchCollapsed: false });
		expect(fitToolbar(input(146.74, base))).toEqual({ visibleIds: ['x'], searchCollapsed: false });
	});

	it('removes a second item when replacing the first with More frees no space', () => {
		const narrow: MeasuredItem[] = [
			{ id: 'x', width: 20, section: 'actions', menuOnly: false },
			{ id: 'y', width: 20, section: 'actions', menuOnly: false }
		];
		// Full row 50. Without y: 20 + 32 + 10 = 62, still too wide. Without both: More alone, 32.
		expect(fitToolbar(input(49, { items: narrow, pinnedWidth: 0, ...noSearch }))).toEqual({
			visibleIds: [],
			searchCollapsed: false
		});
	});

	it('only ever shows a prefix of the keep order and restores it identically when widening', () => {
		const keepOrder = ['v', 'f1', 'f2', 'a1', 'a2'];
		const widths = Array.from({ length: 1401 }, (_, available) => available);
		const down = [...widths].reverse().map((available) => fitToolbar(input(available)));
		const up = widths.map((available) => fitToolbar(input(available)));

		let previousCount = -1;
		let previousCollapsed = true;
		for (const [available, fit] of up.entries()) {
			expect(fit.visibleIds, `prefix of keep order at ${available}px`).toEqual(
				keepOrder.slice(0, fit.visibleIds.length)
			);
			expect(fit.visibleIds.length, `non-decreasing count at ${available}px`).toBeGreaterThanOrEqual(previousCount);
			expect(!fit.searchCollapsed || fit.visibleIds.length === 0, `search collapses last at ${available}px`).toBe(true);
			expect(previousCollapsed || !fit.searchCollapsed, `search never re-collapses at ${available}px`).toBe(true);
			previousCount = fit.visibleIds.length;
			previousCollapsed = fit.searchCollapsed;
		}
		expect(down.reverse()).toEqual(up);
		expect(new Set(up.map((fit) => fit.visibleIds.length))).toEqual(new Set([0, 1, 2, 3, 4, 5]));
	});
});
