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
}

export function buildVirtualMatrixWindow<Row extends OperationalMatrixRow>(
	items: VirtualMatrixItem<Row>[],
	input: VirtualMatrixWindowInput
): VirtualMatrixWindow<Row> {
	const offsets = itemOffsets(items.map((item) => item.height));
	const { start, end, totalHeight } = visibleRange(offsets, input);
	if (start === end) {
		return { visibleItems: [], topSpacerHeight: totalHeight, bottomSpacerHeight: 0, totalHeight };
	}
	return {
		visibleItems: items
			.slice(start, end)
			.map((item, index) => ({ ...item, top: offsets[start + index], virtualIndex: start + index + 1 })),
		topSpacerHeight: offsets[start],
		bottomSpacerHeight: totalHeight - offsets[end],
		totalHeight
	};
}
