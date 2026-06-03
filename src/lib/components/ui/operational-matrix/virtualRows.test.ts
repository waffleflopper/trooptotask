import { describe, expect, it } from 'vitest';
import { buildVirtualMatrixWindow, type VirtualMatrixItem } from './virtualRows.js';

type TestRow = { id: string; label: string };

function row(id: string, height = 10): VirtualMatrixItem<TestRow> {
	return { kind: 'row', key: id, row: { id, label: id }, height };
}

function group(id: string, height = 5): VirtualMatrixItem<TestRow> {
	return { kind: 'group', key: id, group: { id, label: id, rowIds: [] }, height };
}

describe('buildVirtualMatrixWindow', () => {
	it('returns an empty window for empty input', () => {
		const window = buildVirtualMatrixWindow([], { scrollTop: 0, viewportHeight: 100, overscanPx: 20 });

		expect(window.visibleItems).toEqual([]);
		expect(window.topSpacerHeight).toBe(0);
		expect(window.bottomSpacerHeight).toBe(0);
		expect(window.totalHeight).toBe(0);
	});

	it('renders all items when content is shorter than the viewport', () => {
		const window = buildVirtualMatrixWindow([row('a'), row('b')], {
			scrollTop: 0,
			viewportHeight: 100,
			overscanPx: 0
		});

		expect(window.visibleItems.map((item) => item.key)).toEqual(['a', 'b']);
		expect(window.topSpacerHeight).toBe(0);
		expect(window.bottomSpacerHeight).toBe(0);
		expect(window.totalHeight).toBe(20);
		expect(window.visibleItems.map((item) => item.virtualIndex)).toEqual([1, 2]);
	});

	it('windows middle scroll positions and reports spacer heights for omitted rows', () => {
		const items = Array.from({ length: 10 }, (_, index) => row(`row-${index + 1}`));
		const window = buildVirtualMatrixWindow(items, { scrollTop: 35, viewportHeight: 20, overscanPx: 0 });

		expect(window.visibleItems.map((item) => item.key)).toEqual(['row-4', 'row-5', 'row-6']);
		expect(window.visibleItems.map((item) => item.virtualIndex)).toEqual([4, 5, 6]);
		expect(window.topSpacerHeight).toBe(30);
		expect(window.bottomSpacerHeight).toBe(40);
		expect(
			window.topSpacerHeight +
				window.bottomSpacerHeight +
				window.visibleItems.reduce((sum, item) => sum + item.height, 0)
		).toBe(window.totalHeight);
	});

	it('applies overscan before and after the viewport', () => {
		const items = Array.from({ length: 10 }, (_, index) => row(`row-${index + 1}`));
		const window = buildVirtualMatrixWindow(items, { scrollTop: 35, viewportHeight: 20, overscanPx: 10 });

		expect(window.visibleItems.map((item) => item.key)).toEqual(['row-3', 'row-4', 'row-5', 'row-6', 'row-7']);
		expect(window.topSpacerHeight).toBe(20);
		expect(window.bottomSpacerHeight).toBe(30);
	});

	it('keeps group headers in the same virtual stream as rows', () => {
		const window = buildVirtualMatrixWindow([group('alpha'), row('a1'), row('a2'), group('bravo'), row('b1')], {
			scrollTop: 10,
			viewportHeight: 15,
			overscanPx: 0
		});

		expect(window.visibleItems.map((item) => `${item.kind}:${item.key}`)).toEqual(['row:a1', 'row:a2']);
		expect(window.visibleItems.map((item) => item.virtualIndex)).toEqual([2, 3]);
		expect(window.topSpacerHeight).toBe(5);
		expect(window.bottomSpacerHeight).toBe(15);
	});
});
