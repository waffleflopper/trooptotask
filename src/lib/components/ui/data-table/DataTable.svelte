<script lang="ts" generics="T">
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
		RowKey,
		SortDirection
	} from './types.js';
	import DataTableView from './data-table-view.svelte';
	import DataTableSearch from './data-table-search.svelte';
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
		showSearch?: boolean;
		searchPlaceholder?: string;
		rowKey?: (row: T, index: number) => RowKey;
		onRowClick?: (row: T) => void;
		rowActionLabel?: (row: T) => string;
		disabledRow?: (row: T) => boolean;
		loading?: boolean;
		loadingRows?: number;
		density?: 'default' | 'dense';
		compact?: boolean;
		striped?: boolean;
		stickyHeader?: boolean;
		stickyFirstColumn?: boolean;
		maxHeight?: string;
		cell?: DataTableCellSnippet<T>;
		row?: DataTableRowSnippet<T>;
		rowDetail?: DataTableRowDetailSnippet<T>;
		rowDetailVisible?: (row: T) => boolean;
		headerCell?: DataTableHeaderSnippet<T>;
		groupHeader?: DataTableGroupHeaderSnippet;
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
		showSearch = false,
		searchPlaceholder,
		rowKey,
		onRowClick,
		rowActionLabel,
		disabledRow,
		loading,
		loadingRows,
		density,
		compact,
		striped,
		stickyHeader = true,
		stickyFirstColumn,
		maxHeight,
		cell,
		row,
		rowDetail,
		rowDetailVisible,
		headerCell,
		groupHeader,
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

{#snippet combinedToolbar(table: DataTableState<T>)}
	{#if toolbar}
		{@render toolbar(table)}
	{/if}
	{#if showSearch}
		<DataTableSearch {table} ariaLabel={searchPlaceholder ?? 'Search table'} placeholder={searchPlaceholder} />
	{/if}
{/snippet}

<DataTableView
	{table}
	{ariaLabel}
	{emptyMessage}
	{loading}
	{loadingRows}
	{onRowClick}
	{rowActionLabel}
	{density}
	{compact}
	{striped}
	{stickyHeader}
	{stickyFirstColumn}
	{maxHeight}
	{cell}
	{row}
	{rowDetail}
	{rowDetailVisible}
	{headerCell}
	{groupHeader}
	toolbar={toolbar || showSearch ? combinedToolbar : undefined}
	{footer}
/>
