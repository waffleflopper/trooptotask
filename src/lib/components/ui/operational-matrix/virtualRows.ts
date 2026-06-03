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
	{ scrollTop, viewportHeight, overscanPx }: VirtualMatrixWindowInput
): VirtualMatrixWindow<Row> {
	const positionedItems = positionItems(items);
	const totalHeight = positionedItems.at(-1) ? positionedItems.at(-1)!.top + positionedItems.at(-1)!.height : 0;

	if (positionedItems.length === 0 || totalHeight === 0) {
		return {
			visibleItems: [],
			topSpacerHeight: 0,
			bottomSpacerHeight: 0,
			totalHeight: 0
		};
	}

	const safeViewportHeight = Math.max(0, viewportHeight);
	const maxScrollTop = Math.max(0, totalHeight - safeViewportHeight);
	const boundedScrollTop = Math.min(Math.max(0, scrollTop), maxScrollTop);
	const windowTop = Math.max(0, boundedScrollTop - Math.max(0, overscanPx));
	const windowBottom = Math.min(totalHeight, boundedScrollTop + safeViewportHeight + Math.max(0, overscanPx));
	const firstVisibleIndex = positionedItems.findIndex(
		(item) => item.top + item.height > windowTop && item.top < windowBottom
	);

	if (firstVisibleIndex === -1) {
		return {
			visibleItems: [],
			topSpacerHeight: totalHeight,
			bottomSpacerHeight: 0,
			totalHeight
		};
	}

	let lastVisibleIndex = firstVisibleIndex;
	for (let index = firstVisibleIndex; index < positionedItems.length; index += 1) {
		const item = positionedItems[index]!;
		if (item.top >= windowBottom) break;
		lastVisibleIndex = index;
	}

	const visibleItems = positionedItems.slice(firstVisibleIndex, lastVisibleIndex + 1);
	const firstVisibleItem = visibleItems[0]!;
	const lastVisibleItem = visibleItems.at(-1)!;
	const topSpacerHeight = firstVisibleItem.top;
	const bottomSpacerHeight = Math.max(0, totalHeight - (lastVisibleItem.top + lastVisibleItem.height));

	return {
		visibleItems,
		topSpacerHeight,
		bottomSpacerHeight,
		totalHeight
	};
}

function positionItems<Row extends OperationalMatrixRow>(
	items: VirtualMatrixItem<Row>[]
): PositionedVirtualMatrixItem<Row>[] {
	let top = 0;

	return items.map((item, index) => {
		const positionedItem = {
			...item,
			top,
			virtualIndex: index + 1
		};
		top += item.height;
		return positionedItem;
	});
}
