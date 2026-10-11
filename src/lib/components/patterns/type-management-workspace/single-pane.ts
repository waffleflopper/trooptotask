export const DETAIL_HEADING = '[data-slot="type-management-workspace-detail-heading"]';
export const LAYOUT = '[data-slot="type-management-workspace-layout"]';

// Below Tailwind's `lg` the list and detail panes take turns (`max-lg:hidden`); this is the same cut.
const SINGLE_PANE = '(width < 64rem)';

export function isSinglePane() {
	return window.matchMedia(SINGLE_PANE).matches;
}

/** Calls `onNarrow` when a resize or rotation switches the layout to one pane at a time. */
export function whenSinglePaneStarts(onNarrow: () => void) {
	const query = window.matchMedia(SINGLE_PANE);
	const listener = (event: MediaQueryListEvent) => {
		if (event.matches) onNarrow();
	};
	query.addEventListener('change', listener);
	return () => query.removeEventListener('change', listener);
}

export function focusDetailHeading(pane: ParentNode | null | undefined) {
	pane?.querySelector<HTMLElement>(DETAIL_HEADING)?.focus();
}
