<script lang="ts" generics="T">
	import type { EmptyTitleLevel } from '$lib/components/ui/empty/index.js';
	import type {
		ColumnDef,
		DataTableCellSnippet,
		DataTableGroupHeaderSnippet,
		DataTableHeaderSnippet,
		DataTableRowDetailSnippet,
		DataTableRowSnippet,
		DataTableState,
		DataTableStateSnippet,
		GroupDef,
		PageLabels,
		RowKey,
		SortDirection
	} from './types.js';
	import DataTableView from './data-table-view.svelte';
	import { useDataTable } from './useDataTable.svelte';

	type Props = {
		data?: T[];
		columns?: ColumnDef<T>[];
		table?: DataTableState<T>;
		initialSortKey?: string;
		initialSortDirection?: SortDirection;
		pageSize?: number;
		groupBy?: GroupDef<T>;
		filterFn?: (row: T, query: string) => boolean;
		ariaLabel?: string;
		emptyMessage?: string;
		emptyLevel?: EmptyTitleLevel;
		rowKey?: (row: T, index: number) => RowKey;
		onRowClick?: (row: T) => void;
		rowActionLabel?: (row: T) => string;
		disabledRow?: (row: T) => boolean;
		loading?: boolean;
		loadingRows?: number;
		density?: 'default' | 'dense';
		variant?: 'framed' | 'editorial';
		stacked?: boolean;
		compact?: boolean;
		striped?: boolean;
		stickyHeader?: boolean;
		stickyFirstColumn?: boolean;
		maxHeight?: string;
		scrollRegionLabel?: string;
		cell?: DataTableCellSnippet<T>;
		row?: DataTableRowSnippet<T>;
		rowDetail?: DataTableRowDetailSnippet<T>;
		rowDetailVisible?: (row: T) => boolean;
		rowHidden?: (row: T) => boolean;
		pageLabels?: PageLabels;
		headerCell?: DataTableHeaderSnippet<T>;
		groupHeader?: DataTableGroupHeaderSnippet;
		/** A group whose header stays in view under the column header while its rows scroll, until the next one replaces it. */
		stickyGroup?: (key: string) => boolean;
		toolbar?: DataTableStateSnippet<T>;
		footer?: DataTableStateSnippet<T>;
	};

	let {
		data,
		columns,
		table: tableProp,
		initialSortKey,
		initialSortDirection,
		pageSize,
		groupBy,
		filterFn,
		ariaLabel,
		emptyMessage,
		emptyLevel,
		rowKey,
		onRowClick,
		rowActionLabel,
		disabledRow,
		loading,
		loadingRows,
		density,
		variant,
		stacked,
		compact,
		striped,
		stickyHeader = true,
		stickyFirstColumn,
		maxHeight,
		scrollRegionLabel,
		cell,
		row,
		rowDetail,
		rowDetailVisible,
		rowHidden,
		pageLabels,
		headerCell,
		groupHeader,
		stickyGroup,
		toolbar,
		footer
	}: Props = $props();

	const internalTable = useDataTable<T>({
		data: () => data ?? [],
		columns: () => columns ?? [],
		initialSortKey: () => initialSortKey,
		initialSortDirection: () => initialSortDirection,
		pageSize: () => pageSize,
		groupBy: () => groupBy,
		getFilterFn: () => filterFn,
		rowKey: (row, index) => rowKey?.(row, index) ?? defaultRowKey(row, index),
		disabledRow: (row) => disabledRow?.(row) ?? false
	});

	const table = $derived(tableProp ?? internalTable);

	function defaultRowKey(row: T, index: number): RowKey {
		if (row && typeof row === 'object' && 'id' in row) {
			const id = row.id;
			if (typeof id === 'string' || typeof id === 'number') return id;
		}
		return index;
	}
</script>

<DataTableView
	{table}
	{ariaLabel}
	{emptyMessage}
	{emptyLevel}
	{loading}
	{loadingRows}
	{onRowClick}
	{rowActionLabel}
	{density}
	{variant}
	{stacked}
	{compact}
	{striped}
	{stickyHeader}
	{stickyFirstColumn}
	{maxHeight}
	{scrollRegionLabel}
	{cell}
	{row}
	{rowDetail}
	{rowDetailVisible}
	{rowHidden}
	{pageLabels}
	{headerCell}
	{groupHeader}
	{stickyGroup}
	{toolbar}
	{footer}
/>
