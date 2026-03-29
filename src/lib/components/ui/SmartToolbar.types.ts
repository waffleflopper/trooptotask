/**
 * Shared types and pure utility for SmartToolbar.
 * Extracted here so TypeScript can resolve named imports without hitting
 * the ambient `*.svelte` module declaration (which only exposes the default export).
 * Import from this file when you need SmartToolbarItem or computeVisibleItemCount
 * in non-Svelte TypeScript files.
 */

export interface DropdownItem {
	label: string;
	href?: string;
	onclick?: () => void;
	disabled?: boolean;
	active?: boolean;
}

export interface SmartToolbarItem {
	type: 'button' | 'dropdown' | 'icon-button' | 'overflow';
	/** Unique key used for dropdown open/close tracking. Defaults to label if omitted. */
	id?: string;
	label: string;
	/**
	 * SVG markup rendered via {@html}. Must be trusted application-defined content —
	 * never pass user-supplied or API-sourced strings here.
	 */
	icon?: string;
	href?: string;
	onclick?: () => void;
	disabled?: boolean;
	active?: boolean;
	items?: DropdownItem[];
}

/**
 * Determine how many leading toolbar items can be shown inside a fixed-width container.
 *
 * Calculates the maximum count of items from the start of `itemWidths` that fit within `containerWidth`,
 * accounting for inter-item gaps, an optional overflow control (its width and a gap before it), and whether
 * overflow content exists. If `forceCollapse` is true the result is always zero. If `containerWidth` is
 * less than or equal to zero the function returns the total number of items.
 *
 * @param containerWidth - Available width of the container in the same units as item widths
 * @param itemWidths - Array of widths for each toolbar item in display order
 * @param overflowWidth - Width reserved for the overflow control when present
 * @param gapWidth - Width applied between adjacent visible items and between the last visible item and the overflow control when present
 * @param hasOverflowItems - Whether overflow content exists (causes the overflow control to be reserved even if no items are hidden)
 * @param forceCollapse - When true, force zero visible items regardless of widths
 * @returns The number of items (from the start of `itemWidths`) that can be displayed within `containerWidth`
 */
export function computeVisibleItemCount({
	containerWidth,
	itemWidths,
	overflowWidth,
	gapWidth,
	hasOverflowItems,
	forceCollapse = false
}: {
	containerWidth: number;
	itemWidths: number[];
	overflowWidth: number;
	gapWidth: number;
	hasOverflowItems: boolean;
	forceCollapse?: boolean;
}): number {
	if (forceCollapse) return 0;
	if (containerWidth <= 0) return itemWidths.length;

	for (let visibleCount = itemWidths.length; visibleCount >= 0; visibleCount -= 1) {
		const hiddenCount = itemWidths.length - visibleCount;
		const needsOverflow = hasOverflowItems || hiddenCount > 0;
		const visibleWidth = itemWidths.slice(0, visibleCount).reduce((sum, width) => sum + width, 0);
		const visibleGapWidth = visibleCount > 1 ? gapWidth * (visibleCount - 1) : 0;
		const overflowGapWidth = needsOverflow && visibleCount > 0 ? gapWidth : 0;
		const totalWidth = visibleWidth + visibleGapWidth + overflowGapWidth + (needsOverflow ? overflowWidth : 0);

		if (totalWidth <= containerWidth) {
			return visibleCount;
		}
	}

	return 0;
}
