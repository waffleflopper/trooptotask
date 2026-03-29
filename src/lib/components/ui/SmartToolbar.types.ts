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
