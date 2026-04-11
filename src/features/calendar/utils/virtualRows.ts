export interface SizedVirtualRow {
	height: number;
}

export type PositionedVirtualRow<Row extends SizedVirtualRow> = Row & {
	top: number;
};

export interface VirtualRowLayout<Row extends SizedVirtualRow> {
	rows: PositionedVirtualRow<Row>[];
	totalHeight: number;
}

export function buildVirtualRowLayout<Row extends SizedVirtualRow>(rows: Row[]): VirtualRowLayout<Row> {
	let top = 0;
	const positionedRows = rows.map((row) => {
		const positionedRow = { ...row, top };
		top += row.height;
		return positionedRow;
	});

	return {
		rows: positionedRows,
		totalHeight: top
	};
}

export function getVisibleVirtualRows<Row extends PositionedVirtualRow<SizedVirtualRow>>(
	rows: Row[],
	scrollTop: number,
	viewportHeight: number,
	overscanPx: number,
	contentOffsetPx = 0
): Row[] {
	const lastRow = rows.at(-1);
	const totalHeight = lastRow ? lastRow.top + lastRow.height : 0;
	const viewportStart = scrollTop;
	const viewportEnd = scrollTop + viewportHeight;
	const visibleContentTop = Math.max(viewportStart, contentOffsetPx) - contentOffsetPx;
	const visibleContentBottom = Math.max(visibleContentTop, viewportEnd - contentOffsetPx);
	const visibleContentHeight = Math.max(0, visibleContentBottom - visibleContentTop);
	const maxScrollableTop = Math.max(0, totalHeight - visibleContentHeight);
	const boundedScrollTop = Math.min(visibleContentTop, maxScrollableTop);
	const windowTop = Math.max(0, boundedScrollTop - overscanPx);
	const windowBottom = boundedScrollTop + visibleContentHeight + overscanPx;

	return rows.filter((row) => row.top + row.height >= windowTop && row.top <= windowBottom);
}
