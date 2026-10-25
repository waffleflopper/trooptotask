import type { Snippet } from 'svelte';

export type SortDirection = 'asc' | 'desc';
export type RowKey = string | number;

export interface ColumnDef<T> {
	key: string;
	header: string;
	value: (row: T) => unknown;
	headerAriaLabel?: string;
	searchValue?: (row: T) => string;
	compare?: (a: T, b: T) => number;
	searchable?: boolean;
	sortable?: boolean;
	align?: 'left' | 'center' | 'right';
	width?: string;
	/** `'none'` lifts the default 20rem body-cell cap, for content with its own fixed width. */
	maxWidth?: 'none';
	/** Body cells in this column are the row's header (`th scope="row"`). */
	rowHeader?: boolean;
	/**
	 * Hides the column's header and cells with CSS, so the server render already fits a narrow screen.
	 * `'md'` follows the viewport; `'@3xl'` and `'@xl'` follow the table's own width (below 48rem and 36rem), for a table
	 * beside other columns or on a phone.
	 */
	hiddenBelow?: 'md' | '@3xl' | '@xl';
	hidden?: boolean;
}

export interface PageLabels {
	previous: string;
	next: string;
	/** The editorial pager's range line, for a table whose rows are only part of a larger set. */
	range?: (range: { first: number; last: number; total: number }) => string;
}

export interface GroupDef<T> {
	key: (row: T) => string;
	label?: (key: string) => string;
	compare?: (a: string, b: string) => number;
}

export type GroupByOption<T> = GroupDef<T> | (() => GroupDef<T> | undefined);
export type DataTableFilterFn<T> = (row: T, query: string) => boolean;
export type InitialOption<T> = T | (() => T | undefined);

export interface DataTableOptions<T> {
	data: () => T[];
	columns: ColumnDef<T>[] | (() => ColumnDef<T>[]);
	initialSortKey?: InitialOption<string>;
	initialSortDirection?: InitialOption<SortDirection>;
	pageSize?: InitialOption<number>;
	groupBy?: GroupByOption<T>;
	/**
	 * Caps the rows `groups` returns, counted across expanded groups in display order. A collapsed group keeps all its
	 * rows and uses none of the cap; an expanded group past the cap has no rows.
	 */
	groupRowLimit?: number;
	filterFn?: DataTableFilterFn<T>;
	getFilterFn?: () => DataTableFilterFn<T> | undefined;
	resolveColumn?: (key: string) => ColumnDef<T> | undefined;
	rowKey?: (row: T, index: number) => RowKey;
	disabledRow?: (row: T) => boolean;
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
	readonly allRows: T[];
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
	getRowKey: (row: T, index: number) => RowKey;
	isRowDisabled: (row: T) => boolean;
}

export interface GroupHeaderContext {
	key: string;
	label: string;
	count: number;
	collapsed: boolean;
	toggle: () => void;
}

export type DataTableRowAction<T> = {
	label: string;
	onSelect: (row: T) => void;
	disabled?: boolean;
	destructive?: boolean;
};

export type DataTableCellSnippet<T> = Snippet<[T, ColumnDef<T>]>;
export type DataTableHeaderSnippet<T> = Snippet<[ColumnDef<T>]>;
export type DataTableRowSnippet<T> = Snippet<[T, ColumnDef<T>[]]>;
export type DataTableRowDetailSnippet<T> = Snippet<[T]>;
export type DataTableGroupHeaderSnippet = Snippet<[GroupHeaderContext]>;
export type DataTableStateSnippet<T> = Snippet<[DataTableState<T>]>;
