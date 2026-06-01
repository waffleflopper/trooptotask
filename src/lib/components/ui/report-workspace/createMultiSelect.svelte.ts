import { untrack } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';

export interface MultiSelect<T extends { id: string }> {
	readonly options: readonly T[];
	readonly selectedIds: ReadonlySet<string>;
	readonly allSelected: boolean;
	readonly count: number;
	toggle(id: string): void;
	toggleAll(): void;
	has(id: string): boolean;
}

export function createMultiSelect<T extends { id: string }>(options: () => readonly T[]): MultiSelect<T> {
	const selectedIds = new SvelteSet<string>();
	let previousOptionIds: string[] = [];

	$effect(() => {
		const currentOptionIds = options().map((option) => option.id);
		const currentOptionIdSet = new SvelteSet(currentOptionIds);

		untrack(() => {
			const selectedAllPrevious = previousOptionIds.length > 0 && previousOptionIds.every((id) => selectedIds.has(id));
			const shouldSelectAll = (previousOptionIds.length === 0 && selectedIds.size === 0) || selectedAllPrevious;

			if (shouldSelectAll) {
				selectedIds.clear();
				for (const id of currentOptionIds) selectedIds.add(id);
			} else {
				const selectedExistingIds = [...selectedIds].filter((id) => currentOptionIdSet.has(id));
				if (selectedExistingIds.length !== selectedIds.size) {
					selectedIds.clear();
					for (const id of selectedExistingIds) selectedIds.add(id);
				}
			}

			previousOptionIds = currentOptionIds;
		});
	});

	return {
		get options() {
			return options();
		},
		get selectedIds() {
			return selectedIds;
		},
		get allSelected() {
			return selectedIds.size === options().length;
		},
		get count() {
			return selectedIds.size;
		},
		toggle(id: string) {
			if (selectedIds.has(id)) selectedIds.delete(id);
			else selectedIds.add(id);
		},
		toggleAll() {
			const currentOptions = options();
			if (selectedIds.size === currentOptions.length) {
				selectedIds.clear();
				return;
			}

			selectedIds.clear();
			for (const option of currentOptions) selectedIds.add(option.id);
		},
		has(id: string) {
			return selectedIds.has(id);
		}
	};
}
