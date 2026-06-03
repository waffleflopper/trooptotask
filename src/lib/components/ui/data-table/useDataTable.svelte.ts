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

	const columns = $derived.by((): ColumnDef<T>[] =>
		typeof options.columns === 'function' ? options.columns() : options.columns
	);
	const columnsByKey = $derived.by(() => new SvelteMap(columns.map((column) => [column.key, column])));
	const groupDef = $derived.by((): GroupDef<T> | undefined =>
		typeof options.groupBy === 'function' ? options.groupBy() : options.groupBy
	);
	const filteredRows = $derived.by((): T[] => {
		const data = options.data();
		if (!search) return data;

		const filterFn = options.getFilterFn?.() ?? options.filterFn;
		if (filterFn) return data.filter((row) => filterFn(row, search));

		const query = search.toLowerCase();
		const searchableColumns = columns.filter((column) => column.searchable !== false);

		return data.filter((row) =>
			searchableColumns.some((column) => {
				const text = column.searchValue ? column.searchValue(row) : String(column.value(row) ?? '');
				return text.toLowerCase().includes(query);
			})
		);
	});
	const sortedRows = $derived.by((): T[] => {
		if (!sortKey) return filteredRows;

		const column = getColumn(sortKey);
		if (!column || column.sortable === false) return filteredRows;

		const direction = sortDirection === 'asc' ? 1 : -1;
		return [...filteredRows].sort((a, b) => compareRows(a, b, column, direction));
	});
	const totalRows = $derived(sortedRows.length);
	const totalPages = $derived(currentPageSize > 0 ? Math.max(1, Math.ceil(totalRows / currentPageSize)) : 1);
	const pagedRows = $derived.by((): T[] => {
		if (currentPageSize <= 0) return sortedRows;

		const currentPage = clampPage(page, totalPages);
		const start = (currentPage - 1) * currentPageSize;
		return sortedRows.slice(start, start + currentPageSize);
	});
	const groupRows = $derived.by((): Array<Omit<DataTableGroup<T>, 'collapsed'>> => {
		if (!groupDef) return [];

		const groupedRows = new SvelteMap<string, T[]>();
		for (const row of sortedRows) {
			const key = groupDef.key(row);
			const rows = groupedRows.get(key);
			if (rows) rows.push(row);
			else groupedRows.set(key, [row]);
		}

		const keys = [...groupedRows.keys()];
		if (groupDef.compare) keys.sort(groupDef.compare);

		return keys.map((key) => ({
			key,
			label: groupDef.label?.(key) ?? key,
			rows: groupedRows.get(key) ?? []
		}));
	});
	const groups = $derived.by((): DataTableGroup<T>[] =>
		groupRows.map((group) => ({ ...group, collapsed: collapsedGroups.has(group.key) }))
	);

	function getColumn(key: string): ColumnDef<T> | undefined {
		return columnsByKey.get(key) ?? options.resolveColumn?.(key);
	}

	function repairPage(): void {
		const currentPage = clampPage(page, totalPages);
		if (currentPage !== page) page = currentPage;
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
			return columns;
		},
		get rows() {
			repairPage();
			return pagedRows;
		},
		get allRows() {
			return sortedRows;
		},
		get groups() {
			return groups;
		},
		get totalRows() {
			return totalRows;
		},
		get totalPages() {
			repairPage();
			return totalPages;
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
			repairPage();
			return page;
		},
		get pageSize() {
			return currentPageSize;
		},
		setPage(nextPage: number) {
			page = clampPage(nextPage, totalPages);
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
			const keys = groups.map((group) => group.key);
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
