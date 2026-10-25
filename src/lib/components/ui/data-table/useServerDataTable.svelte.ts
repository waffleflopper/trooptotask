import type { ColumnDef, DataTableState, RowKey, SortDirection } from './types.js';

export interface ServerDataTableOptions<T> {
	/** The rows the server returned, already sorted and paged. */
	rows: () => T[];
	columns: () => ColumnDef<T>[];
	sort: () => { key: string; direction: SortDirection };
	/** A header was pressed. The owner asks the server for the new order, usually by changing the URL. */
	onSort: (key: string) => void;
	/** Omit for a table that shows every row it was given, such as a Load more list. */
	paging?: {
		page: () => number;
		pageSize: number;
		totalRows: () => number;
		onPage: (page: number) => void;
	};
	rowKey?: (row: T, index: number) => RowKey;
}

/** Table state for rows the server sorts and pages, so the shared DataTable renders its headers, `aria-sort` and pager. */
export function useServerDataTable<T>(options: ServerDataTableOptions<T>): DataTableState<T> {
	const totalRows = $derived(options.paging?.totalRows() ?? options.rows().length);
	const pageSize = options.paging?.pageSize ?? 0;

	return {
		get columns() {
			return options.columns();
		},
		get rows() {
			return options.rows();
		},
		get allRows() {
			return options.rows();
		},
		groups: [],
		get totalRows() {
			return totalRows;
		},
		get totalPages() {
			return pageSize > 0 ? Math.max(1, Math.ceil(totalRows / pageSize)) : 1;
		},
		get sortKey() {
			return options.sort().key;
		},
		get sortDirection() {
			return options.sort().direction;
		},
		toggleSort: (key) => options.onSort(key),
		search: '',
		setSearch: () => {},
		get page() {
			return options.paging?.page() ?? 1;
		},
		pageSize,
		setPage: (page) => options.paging?.onPage(page),
		setPageSize: () => {},
		toggleGroup: () => {},
		expandAll: () => {},
		collapseAll: () => {},
		getRowKey: (row, index) => {
			if (options.rowKey) return options.rowKey(row, index);
			if (row && typeof row === 'object' && 'id' in row && (typeof row.id === 'string' || typeof row.id === 'number'))
				return row.id;
			return index;
		},
		isRowDisabled: () => false
	};
}
