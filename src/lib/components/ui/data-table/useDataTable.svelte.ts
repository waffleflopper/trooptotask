export type SortDirection = 'asc' | 'desc';

export interface ColumnDef<T> {
	key: string;
	header: string;
	value: (row: T) => unknown;
	searchValue?: (row: T) => string;
	compare?: (a: T, b: T) => number;
	searchable?: boolean;
}

export interface GroupDef<T> {
	key: (row: T) => string;
	label?: (key: string) => string;
	compare?: (a: string, b: string) => number;
}

export interface DataTableOptions<T> {
	data: () => T[];
	columns: ColumnDef<T>[];
	initialSortKey?: string;
	initialSortDirection?: SortDirection;
	pageSize?: number;
	groupBy?: GroupDef<T>;
	filterFn?: (row: T, query: string) => boolean;
}

export interface DataTableGroup<T> {
	key: string;
	label: string;
	rows: T[];
	collapsed: boolean;
}

export interface DataTableState<T> {
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
	let sortKey = $state<string | null>(options.initialSortKey ?? null);
	let sortDirection = $state<SortDirection>(options.initialSortDirection ?? 'asc');
	let search = $state('');
	let page = $state(1);
	let currentPageSize = $state(options.pageSize ?? 0);
	let collapsedGroups = $state<Set<string>>(new Set());

	const columnMap = new Map(options.columns.map((c) => [c.key, c]));

	function getFiltered(): T[] {
		const data = options.data();
		if (!search) return data;

		if (options.filterFn) {
			return data.filter((row) => options.filterFn!(row, search));
		}

		const query = search.toLowerCase();
		const searchableCols = options.columns.filter((c) => c.searchable !== false);

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
		const col = columnMap.get(sortKey);
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
		if (!options.groupBy) return [];
		const sorted = getSorted();
		const groupDef = options.groupBy;
		const groupMap = new Map<string, T[]>();

		for (const row of sorted) {
			const key = groupDef.key(row);
			const existing = groupMap.get(key);
			if (existing) {
				existing.push(row);
			} else {
				groupMap.set(key, [row]);
			}
		}

		const keys = [...groupMap.keys()];
		if (groupDef.compare) {
			keys.sort(groupDef.compare);
		}

		return keys.map((key) => ({
			key,
			label: groupDef.label ? groupDef.label(key) : key,
			rows: groupMap.get(key)!,
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
			const next = new Set(collapsedGroups);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			collapsedGroups = next;
		},
		expandAll() {
			collapsedGroups = new Set();
		},
		collapseAll() {
			const allKeys = getGroups().map((g) => g.key);
			collapsedGroups = new Set(allKeys);
		}
	};
}
