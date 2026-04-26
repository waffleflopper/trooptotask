export interface ProgressiveToolbarAction {
	id: string;
	label: string;
	href?: string;
	onclick?: () => void;
	disabled?: boolean;
	className?: string;
}

export function computeProgressiveVisibleCount({
	containerWidth,
	itemWidths,
	overflowWidth,
	gapWidth
}: {
	containerWidth: number;
	itemWidths: number[];
	overflowWidth: number;
	gapWidth: number;
}): number {
	if (containerWidth <= 0) return 0;

	for (let visibleCount = itemWidths.length; visibleCount >= 0; visibleCount -= 1) {
		const hiddenCount = itemWidths.length - visibleCount;
		const needsOverflow = hiddenCount > 0;
		const visibleWidths = itemWidths.slice(itemWidths.length - visibleCount);
		const visibleWidth = visibleWidths.reduce((sum, width) => sum + width, 0);
		const visibleGapWidth = visibleCount > 1 ? gapWidth * (visibleCount - 1) : 0;
		const overflowGapWidth = needsOverflow && visibleCount > 0 ? gapWidth : 0;
		const totalWidth = visibleWidth + visibleGapWidth + overflowGapWidth + (needsOverflow ? overflowWidth : 0);

		if (totalWidth <= containerWidth) {
			return visibleCount;
		}
	}

	return 0;
}
