export type ToolbarSection = 'view' | 'filters' | 'actions';

export type MeasuredItem = {
	id: string;
	width: number;
	section: ToolbarSection;
	menuOnly: boolean;
};

/** Widths are CSS pixels. `pinnedWidth` is the primary's width, or 0 when there is no primary. */
export type FitInput = {
	available: number;
	gap: number;
	pinnedWidth: number;
	moreWidth: number;
	items: MeasuredItem[];
} & ({ searchMinWidth: null; searchIconWidth: null } | { searchMinWidth: number; searchIconWidth: number });

export type FitResult = { visibleIds: string[]; searchCollapsed: boolean };

const foldOrder: ToolbarSection[] = ['actions', 'filters', 'view'];

/** Folds the least important item of the lowest section until the row fits; `items` arrive in rank order. */
export function fitToolbar(input: FitInput): FitResult {
	const candidates = input.items.filter((item) => !item.menuOnly);
	const visible = new Set(candidates.map((item) => item.id));
	let itemWidth = candidates.reduce((sum, item) => sum + item.width, 0);
	let count = candidates.length;
	let hasMore = input.items.some((item) => item.menuOnly);
	const hasPrimary = input.pinnedWidth > 0;
	const hasSearch = input.searchMinWidth !== null;
	const searchWidth = input.searchMinWidth ?? 0;

	function fits(): boolean {
		const controls = count + Number(hasPrimary) + Number(hasSearch) + Number(hasMore);
		const required =
			itemWidth +
			input.pinnedWidth +
			searchWidth +
			(hasMore ? input.moreWidth : 0) +
			input.gap * Math.max(0, controls - 1);
		return required <= input.available;
	}

	function result(searchCollapsed: boolean): FitResult {
		return { visibleIds: candidates.filter((item) => visible.has(item.id)).map((item) => item.id), searchCollapsed };
	}

	const reverseRank = [...candidates].reverse();
	for (const section of foldOrder) {
		for (const item of reverseRank) {
			if (item.section !== section) continue;
			if (fits()) return result(false);
			visible.delete(item.id);
			itemWidth -= item.width;
			count--;
			hasMore = true;
		}
	}
	// Only pinned controls remain, so search is the last thing allowed to shrink.
	return result(hasSearch && !fits());
}
