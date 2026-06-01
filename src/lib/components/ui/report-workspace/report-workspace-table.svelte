<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import type {
		ColumnDef,
		DataTableCellSnippet,
		DataTableHeaderSnippet,
		DataTableRowDetailSnippet,
		DataTableRowSnippet,
		DataTableStateSnippet,
		DataTableState
	} from '$lib/components/ui/data-table/index.js';
	import * as DataTable from '$lib/components/ui/data-table/index.js';
	import Section from './report-workspace-section.svelte';

	type Props = {
		title: string;
		description?: string;
		meta?: string;
		data?: T[];
		columns?: ColumnDef<T>[];
		table?: DataTableState<T>;
		ariaLabel?: string;
		emptyMessage?: string;
		loading?: boolean;
		showSearch?: boolean;
		searchPlaceholder?: string;
		pageSize?: number;
		density?: 'default' | 'dense';
		cell?: DataTableCellSnippet<T>;
		row?: DataTableRowSnippet<T>;
		rowDetail?: DataTableRowDetailSnippet<T>;
		rowDetailVisible?: (row: T) => boolean;
		onRowClick?: (row: T) => void;
		rowActionLabel?: (row: T) => string;
		headerCell?: DataTableHeaderSnippet<T>;
		footer?: DataTableStateSnippet<T>;
		actions?: Snippet;
	};

	let {
		title,
		description,
		meta,
		data,
		columns,
		table,
		ariaLabel,
		emptyMessage = 'No report rows.',
		loading = false,
		showSearch = false,
		searchPlaceholder,
		pageSize,
		density = 'dense',
		cell,
		row,
		rowDetail,
		rowDetailVisible,
		onRowClick,
		rowActionLabel,
		headerCell,
		footer,
		actions
	}: Props = $props();
</script>

<Section {title} {description} {meta} {actions}>
	<DataTable.DataTable
		{data}
		{columns}
		{table}
		{ariaLabel}
		{emptyMessage}
		{loading}
		{showSearch}
		{searchPlaceholder}
		{pageSize}
		{density}
		{onRowClick}
		{rowActionLabel}
		stickyHeader
		maxHeight="28rem"
		{cell}
		{row}
		{rowDetail}
		{rowDetailVisible}
		{headerCell}
		{footer}
	/>
</Section>
