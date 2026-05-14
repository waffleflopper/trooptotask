import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import type {
	ColumnDef,
	DataTableGroup,
	DataTableOptions,
	DataTableState,
	GroupDef,
	InitialOption,
	RowKey,
	SortDirection
} from './types.js';

export type {
	ColumnDef,
	DataTableFilterFn,
	DataTableGroup,
	DataTableOptions,
	DataTableState,
	GroupDef,
	GroupByOption,
	InitialOption,
	RowKey,
	SortDirection
} from './types.js';

export function useDataTable<T>(options: DataTableOptions<T>): DataTableState<T> {
	let sortKey = $state<string | null>(resolveInitialOption(options.initialSortKey) ?? null);
	let sortDirection = $state<SortDirection>(resolveInitialOption(options.initialSortDirection) ?? 'asc');
	let search = $state('');
	let page = $state(1);
	let currentPageSize = $state(resolveInitialOption(options.pageSize) ?? 0);
	const collapsedGroups = new SvelteSet<string>();

	function getColumns(): ColumnDef<T>[] {
		return typeof options.columns === 'function' ? options.columns() : options.columns;
	}

	function getColumn(key: string): ColumnDef<T> | undefined {
		return getColumns().find((column) => column.key === key) ?? options.resolveColumn?.(key);
	}

	function getGroupDef(): GroupDef<T> | undefined {
		return typeof options.groupBy === 'function' ? options.groupBy() : options.groupBy;
	}

	function getFilteredRows(): T[] {
		const data = options.data();
		if (!search) return data;

		const filterFn = options.getFilterFn?.() ?? options.filterFn;
		if (filterFn) return data.filter((row) => filterFn(row, search));

		const query = search.toLowerCase();
		const searchableColumns = getColumns().filter((column) => column.searchable !== false);

		return data.filter((row) =>
			searchableColumns.some((column) => {
				const text = column.searchValue ? column.searchValue(row) : String(column.value(row) ?? '');
				return text.toLowerCase().includes(query);
			})
		);
	}

	function getSortedRows(): T[] {
		const rows = getFilteredRows();
		if (!sortKey) return rows;

		const column = getColumn(sortKey);
		if (!column || column.sortable === false) return rows;

		const direction = sortDirection === 'asc' ? 1 : -1;
		return [...rows].sort((a, b) => compareRows(a, b, column, direction));
	}

	function getPagedRows(): T[] {
		const rows = getSortedRows();
		if (currentPageSize <= 0) return rows;

		const currentPage = clampPage(page, getTotalPages());
		if (currentPage !== page) page = currentPage;

		const start = (currentPage - 1) * currentPageSize;
		return rows.slice(start, start + currentPageSize);
	}

	function getGroups(): DataTableGroup<T>[] {
		const groupBy = getGroupDef();
		if (!groupBy) return [];

		const groupedRows = new SvelteMap<string, T[]>();
		for (const row of getSortedRows()) {
			const key = groupBy.key(row);
			const rows = groupedRows.get(key);
			if (rows) rows.push(row);
			else groupedRows.set(key, [row]);
		}

		const keys = [...groupedRows.keys()];
		if (groupBy.compare) keys.sort(groupBy.compare);

		return keys.map((key) => ({
			key,
			label: groupBy.label?.(key) ?? key,
			rows: groupedRows.get(key) ?? [],
			collapsed: collapsedGroups.has(key)
		}));
	}

	function getTotalRows(): number {
		return getSortedRows().length;
	}

	function getTotalPages(): number {
		return currentPageSize > 0 ? Math.max(1, Math.ceil(getTotalRows() / currentPageSize)) : 1;
	}

	function getRowKey(row: T, index: number): RowKey {
		if (options.rowKey) return options.rowKey(row, index);
		if (row && typeof row === 'object' && 'id' in row) {
			const id = row.id;
			if (typeof id === 'string' || typeof id === 'number') return id;
		}
		return index;
	}

	return {
		get columns() {
			return getColumns();
		},
		get rows() {
			return getPagedRows();
		},
		get allRows() {
			return getSortedRows();
		},
		get groups() {
			return getGroups();
		},
		get totalRows() {
			return getTotalRows();
		},
		get totalPages() {
			return getTotalPages();
		},
		get sortKey() {
			return sortKey;
		},
		get sortDirection() {
			return sortDirection;
		},
		toggleSort(key: string) {
			const column = getColumn(key);
			if (column?.sortable === false) return;

			if (sortKey === key) sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
			else {
				sortKey = key;
				sortDirection = 'asc';
			}
			page = 1;
		},
		get search() {
			return search;
		},
		setSearch(query: string) {
			search = query;
			page = 1;
		},
		get page() {
			return page;
		},
		get pageSize() {
			return currentPageSize;
		},
		setPage(nextPage: number) {
			page = clampPage(nextPage, getTotalPages());
		},
		setPageSize(size: number) {
			currentPageSize = Math.max(0, size);
			page = 1;
		},
		toggleGroup(key: string) {
			if (collapsedGroups.has(key)) collapsedGroups.delete(key);
			else collapsedGroups.add(key);
		},
		expandAll() {
			collapsedGroups.clear();
		},
		collapseAll() {
			const keys = getGroups().map((group) => group.key);
			collapsedGroups.clear();
			for (const key of keys) collapsedGroups.add(key);
		},
		getRowKey,
		isRowDisabled(row: T) {
			return options.disabledRow?.(row) ?? false;
		}
	};
}

function compareRows<T>(a: T, b: T, column: ColumnDef<T>, direction: 1 | -1): number {
	if (column.compare) return column.compare(a, b) * direction;

	const aValue = column.value(a);
	const bValue = column.value(b);

	if (aValue == null && bValue == null) return 0;
	if (aValue == null) return 1;
	if (bValue == null) return -1;
	if (typeof aValue === 'number' && typeof bValue === 'number') return (aValue - bValue) * direction;

	return String(aValue).localeCompare(String(bValue)) * direction;
}

function clampPage(page: number, totalPages: number): number {
	return Math.max(1, Math.min(page, totalPages));
}

function resolveInitialOption<T>(option: InitialOption<T> | undefined): T | undefined {
	return typeof option === 'function' ? (option as () => T | undefined)() : option;
}
