<script lang="ts" generics="T">
	import type {
		ColumnDef,
		DataTableCellSnippet,
		DataTableHeaderSnippet,
		DataTableRowSnippet,
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
		headerCell?: DataTableHeaderSnippet<T>;
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
		headerCell
	}: Props = $props();
</script>

<Section {title} {description} {meta}>
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
		stickyHeader
		maxHeight="28rem"
		{cell}
		{row}
		{headerCell}
	/>
</Section>
