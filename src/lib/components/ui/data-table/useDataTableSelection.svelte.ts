import { SvelteSet } from 'svelte/reactivity';
import type { RowKey } from './types.js';

export interface DataTableSelectionState<T> {
	readonly selectedKeys: Set<RowKey>;
	readonly selectedRows: T[];
	readonly selectedCount: number;
	isSelected: (row: T, index: number) => boolean;
	toggleRow: (row: T, index: number, selected?: boolean) => void;
	clear: () => void;
	readonly allPageRowsSelected: boolean;
	readonly somePageRowsSelected: boolean;
	toggleAllPageRows: (selected?: boolean) => void;
}

export function useDataTableSelection<T>(options: {
	rows: () => T[];
	rowKey: (row: T, index: number) => RowKey;
	disabledRow?: (row: T) => boolean;
}): DataTableSelectionState<T> {
	const selectedKeys = new SvelteSet<RowKey>();

	function selectableRows(): { row: T; index: number; key: RowKey }[] {
		return options
			.rows()
			.map((row, index) => ({ row, index, key: options.rowKey(row, index) }))
			.filter(({ row }) => !(options.disabledRow?.(row) ?? false));
	}

	function setRow(row: T, index: number, selected: boolean): void {
		const key = options.rowKey(row, index);
		if (selected) selectedKeys.add(key);
		else selectedKeys.delete(key);
	}

	function areAllPageRowsSelected(): boolean {
		const rows = selectableRows();
		return rows.length > 0 && rows.every(({ key }) => selectedKeys.has(key));
	}

	function areSomePageRowsSelected(): boolean {
		const rows = selectableRows();
		return rows.some(({ key }) => selectedKeys.has(key)) && !rows.every(({ key }) => selectedKeys.has(key));
	}

	return {
		get selectedKeys() {
			return selectedKeys;
		},
		get selectedRows() {
			const pageRows = options.rows();
			return pageRows.filter((row, index) => selectedKeys.has(options.rowKey(row, index)));
		},
		get selectedCount() {
			return selectedKeys.size;
		},
		isSelected(row, index) {
			return selectedKeys.has(options.rowKey(row, index));
		},
		toggleRow(row, index, selected) {
			setRow(row, index, selected ?? !selectedKeys.has(options.rowKey(row, index)));
		},
		clear() {
			selectedKeys.clear();
		},
		get allPageRowsSelected() {
			return areAllPageRowsSelected();
		},
		get somePageRowsSelected() {
			return areSomePageRowsSelected();
		},
		toggleAllPageRows(selected) {
			const shouldSelect = selected ?? !areAllPageRowsSelected();
			for (const { row, index } of selectableRows()) setRow(row, index, shouldSelect);
		}
	};
}
