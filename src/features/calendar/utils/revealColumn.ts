const FIT_TOLERANCE_PX = 1;

export interface RevealColumnInput {
	scrollLeft: number;
	/** Width of the scroll viewport, including the sticky leading column. */
	clientWidth: number;
	/** Width of the sticky column that covers the left edge of the viewport. */
	leadingWidth: number;
	columnWidth: number;
	/** The column's position among the scrolling date columns, starting at 0. */
	index: number;
}

/** The `scrollLeft` that puts a date column just right of the sticky column, or null when it is already fully visible. */
export function scrollLeftToRevealColumn(input: RevealColumnInput): number | null {
	const { scrollLeft, clientWidth, leadingWidth, columnWidth, index } = input;
	const start = index * columnWidth;
	const visibleEnd = scrollLeft + clientWidth - leadingWidth;
	const fits = start >= scrollLeft - FIT_TOLERANCE_PX && start + columnWidth <= visibleEnd + FIT_TOLERANCE_PX;
	return fits ? null : start;
}
