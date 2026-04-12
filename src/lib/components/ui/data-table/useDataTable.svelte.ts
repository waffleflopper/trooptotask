import { SvelteSet } from 'svelte/reactivity';

export type SortDirection = 'asc' | 'desc';

export interface ColumnDef<T> {
	key: string;
	header: string;
	value: (row: T) => unknown;
	headerAriaLabel?: string;
	searchValue?: (row: T) => string;
	compare?: (a: T, b: T) => number;
	searchable?: boolean;
	sortable?: boolean;
}

export interface GroupDef<T> {
	key: (row: T) => string;
	label?: (key: string) => string;
	compare?: (a: string, b: string) => number;
}

export type GroupByOption<T> = GroupDef<T> | (() => GroupDef<T> | undefined);
type FilterFn<T> = (row: T, query: string) => boolean;
type InitialOption<T> = T | (() => T | undefined);

/**
 * Options for useDataTable. `data` is reactive via closure; `groupBy` can also
 * be supplied as a getter when grouping must track parent state.
 */
export interface DataTableOptions<T> {
	data: () => T[];
	columns: ColumnDef<T>[] | (() => ColumnDef<T>[]);
	initialSortKey?: InitialOption<string>;
	initialSortDirection?: InitialOption<SortDirection>;
	pageSize?: InitialOption<number>;
	groupBy?: GroupByOption<T>;
	filterFn?: FilterFn<T>;
	getFilterFn?: () => FilterFn<T> | undefined;
	/** Resolve dynamic columns not in the static list (e.g. for runtime-generated sort keys) */
	resolveColumn?: (key: string) => ColumnDef<T> | undefined;
}

export interface DataTableGroup<T> {
	key: string;
	label: string;
	rows: T[];
	collapsed: boolean;
}

export interface DataTableState<T> {
	readonly columns: ColumnDef<T>[];
	readonly rows: T[];
	readonly groups: DataTableGroup<T>[];
	readonly totalRows: number;
	readonly totalPages: number;
	readonly sortKey: string | null;
	readonly sortDirection: SortDirection;
	toggleSort: (key: string) => void;
	readonly search: string;
	setSearch: (query: string) => void;
	readonly page: number;
	readonly pageSize: number;
	setPage: (page: number) => void;
	setPageSize: (size: number) => void;
	toggleGroup: (key: string) => void;
	expandAll: () => void;
	collapseAll: () => void;
}

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

	function getFilterFn(): FilterFn<T> | undefined {
		return options.getFilterFn?.() ?? options.filterFn;
	}

	function getFiltered(): T[] {
		const data = options.data();
		if (!search) return data;

		const filterFn = getFilterFn();
		if (filterFn) {
			return data.filter((row) => filterFn(row, search));
		}

		const query = search.toLowerCase();
		const searchableCols = getColumns().filter((c) => c.searchable !== false);

		return data.filter((row) =>
			searchableCols.some((col) => {
				const text = col.searchValue ? col.searchValue(row) : String(col.value(row) ?? '');
				return text.toLowerCase().includes(query);
			})
		);
	}

	function getSorted(): T[] {
		const data = getFiltered();
		if (!sortKey) return data;
		const col = getColumn(sortKey);
		if (!col) return data;

		const dir = sortDirection === 'asc' ? 1 : -1;
		return [...data].sort((a, b) => {
			if (col.compare) return col.compare(a, b) * dir;

			const aVal = col.value(a);
			const bVal = col.value(b);

			if (aVal == null && bVal == null) return 0;
			if (aVal == null) return 1;
			if (bVal == null) return -1;

			if (typeof aVal === 'string' && typeof bVal === 'string') {
				return aVal.localeCompare(bVal) * dir;
			}
			if (typeof aVal === 'number' && typeof bVal === 'number') {
				return (aVal - bVal) * dir;
			}
			return String(aVal).localeCompare(String(bVal)) * dir;
		});
	}

	function getGroups(): DataTableGroup<T>[] {
		const groupDef = typeof options.groupBy === 'function' ? options.groupBy() : options.groupBy;
		if (!groupDef) return [];
		const sorted = getSorted();
		const groupedRows: Record<string, T[]> = Object.create(null);
		const keys: string[] = [];

		for (const row of sorted) {
			const key = groupDef.key(row);
			if (!Object.hasOwn(groupedRows, key)) {
				groupedRows[key] = [];
				keys.push(key);
			}
			groupedRows[key].push(row);
		}

		if (groupDef.compare) {
			keys.sort(groupDef.compare);
		}

		return keys.map((key) => ({
			key,
			label: groupDef.label ? groupDef.label(key) : key,
			rows: groupedRows[key],
			collapsed: collapsedGroups.has(key)
		}));
	}

	function getTotalRows(): number {
		return getSorted().length;
	}

	function getTotalPages(): number {
		return currentPageSize > 0 ? Math.max(1, Math.ceil(getTotalRows() / currentPageSize)) : 1;
	}

	function getPaged(): T[] {
		const sorted = getSorted();
		if (currentPageSize <= 0) return sorted;
		const start = (page - 1) * currentPageSize;
		return sorted.slice(start, start + currentPageSize);
	}

	return {
		get columns() {
			return getColumns();
		},
		get rows() {
			return getPaged();
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
			const col = getColumn(key);
			if (col?.sortable === false) return;
			if (sortKey === key) {
				sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
			} else {
				sortKey = key;
				sortDirection = 'asc';
			}
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
		setPage(p: number) {
			page = Math.max(1, Math.min(p, getTotalPages()));
		},
		setPageSize(size: number) {
			currentPageSize = size;
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
			const allKeys = getGroups().map((g) => g.key);
			collapsedGroups.clear();
			for (const key of allKeys) {
				collapsedGroups.add(key);
			}
		}
	};
}

function resolveInitialOption<T>(option: InitialOption<T> | undefined): T | undefined {
	return typeof option === 'function' ? (option as () => T | undefined)() : option;
}
