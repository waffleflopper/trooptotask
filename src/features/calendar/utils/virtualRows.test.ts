import { describe, expect, it } from 'vitest';
import { buildVirtualRowLayout, getVisibleVirtualRows } from './virtualRows';

describe('virtualRows', () => {
	it('returns a bounded window of positioned rows', () => {
		const layout = buildVirtualRowLayout([
			{ id: 'row-1', height: 20 },
			{ id: 'row-2', height: 20 },
			{ id: 'row-3', height: 20 },
			{ id: 'row-4', height: 20 }
		]);

		const visibleRows = getVisibleVirtualRows(layout.rows, 40, 20, 0);

		expect(visibleRows.map((row) => row.id)).toEqual(['row-2', 'row-3', 'row-4']);
		expect(layout.totalHeight).toBe(80);
	});

	it('keeps bottom rows visible when scroll position is beyond the current content height', () => {
		const layout = buildVirtualRowLayout([
			{ id: 'row-1', height: 20 },
			{ id: 'row-2', height: 20 },
			{ id: 'row-3', height: 20 }
		]);

		const visibleRows = getVisibleVirtualRows(layout.rows, 10_000, 20, 0);

		expect(visibleRows.map((row) => row.id)).toContain('row-3');
		expect(visibleRows.map((row) => row.id)).not.toContain('row-1');
	});

	it('keeps all rows visible when content is shorter than the viewport even with stale scroll position', () => {
		const layout = buildVirtualRowLayout([
			{ id: 'row-1', height: 20 },
			{ id: 'row-2', height: 20 },
			{ id: 'row-3', height: 20 }
		]);

		const visibleRows = getVisibleVirtualRows(layout.rows, 10_000, 200, 0);

		expect(visibleRows.map((row) => row.id)).toEqual(['row-1', 'row-2', 'row-3']);
	});

	it('treats scroll positions before the virtual body offset as the start of the row window', () => {
		const layout = buildVirtualRowLayout([
			{ id: 'row-1', height: 20 },
			{ id: 'row-2', height: 20 },
			{ id: 'row-3', height: 20 }
		]);

		const visibleRows = getVisibleVirtualRows(layout.rows, 70, 20, 0, 64);

		expect(visibleRows.map((row) => row.id)).toEqual(['row-1', 'row-2']);
	});
});
