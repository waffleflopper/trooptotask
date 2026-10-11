export const DETAIL_HEADING = '[data-slot="type-management-workspace-detail-heading"]';

// Below Tailwind's `lg` the list and detail panes take turns (`max-lg:hidden`); this is the same cut.
export function isSinglePane() {
	return window.matchMedia('(width < 64rem)').matches;
}

export function focusDetailHeading(pane: ParentNode | null | undefined) {
	pane?.querySelector<HTMLElement>(DETAIL_HEADING)?.focus();
}
