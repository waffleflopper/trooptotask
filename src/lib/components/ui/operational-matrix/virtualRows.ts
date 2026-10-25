import { itemOffsets, visibleRange } from '$lib/components/ui/virtual-list';
import type { OperationalMatrixRow, OperationalMatrixRowGroup } from './types.js';

export type VirtualMatrixItem<Row extends OperationalMatrixRow = OperationalMatrixRow> =
	| {
			kind: 'group';
			key: string;
			group: OperationalMatrixRowGroup;
			height: number;
	  }
	| {
			kind: 'row';
			key: string;
			row: Row;
			height: number;
	  };

export type PositionedVirtualMatrixItem<Row extends OperationalMatrixRow = OperationalMatrixRow> =
	VirtualMatrixItem<Row> & {
		top: number;
		virtualIndex: number;
		/** Height of the omitted items between this and the previous visible item. */
		gapBefore: number;
	};

export interface VirtualMatrixWindow<Row extends OperationalMatrixRow = OperationalMatrixRow> {
	visibleItems: PositionedVirtualMatrixItem<Row>[];
	topSpacerHeight: number;
	bottomSpacerHeight: number;
	totalHeight: number;
}

interface VirtualMatrixWindowInput {
	scrollTop: number;
	viewportHeight: number;
	overscanPx: number;
	/** Stays visible outside the window, e.g. the row holding keyboard focus. */
	pinnedKey?: string | null;
}

export function buildVirtualMatrixWindow<Row extends OperationalMatrixRow>(
	items: VirtualMatrixItem<Row>[],
	input: VirtualMatrixWindowInput
): VirtualMatrixWindow<Row> {
	const offsets = itemOffsets(items.map((item) => item.height));
	const { start, end, totalHeight } = visibleRange(offsets, input);
	const indices = Array.from({ length: end - start }, (_, index) => start + index);
	const pinned = input.pinnedKey == null ? -1 : items.findIndex((item) => item.key === input.pinnedKey);
	if (pinned >= 0 && pinned < start) indices.unshift(pinned);
	if (pinned >= end) indices.push(pinned);
	if (indices.length === 0) {
		return { visibleItems: [], topSpacerHeight: totalHeight, bottomSpacerHeight: 0, totalHeight };
	}
	const first = indices[0];
	const last = indices[indices.length - 1];
	return {
		visibleItems: indices.map((index, position) => ({
			...items[index],
			top: offsets[index],
			virtualIndex: index + 1,
			gapBefore: position === 0 ? 0 : offsets[index] - offsets[indices[position - 1] + 1]
		})),
		topSpacerHeight: offsets[first],
		bottomSpacerHeight: totalHeight - offsets[last + 1],
		totalHeight
	};
}
