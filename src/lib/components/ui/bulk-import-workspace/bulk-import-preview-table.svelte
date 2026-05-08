<script lang="ts" generics="T">
	import type {
		ColumnDef,
		DataTableCellSnippet,
		DataTableHeaderSnippet,
		DataTableSelectionState
	} from '$lib/components/ui/data-table/index.js';
	import * as DataTable from '$lib/components/ui/data-table/index.js';
	import { Button } from '$lib/components/ui/button/index.js';

	type Props = {
		rows: T[];
		columns: ColumnDef<T>[];
		ariaLabel?: string;
		emptyMessage?: string;
		loading?: boolean;
		selection?: DataTableSelectionState<T>;
		rowKey?: (row: T, index: number) => string | number;
		disabledRow?: (row: T) => boolean;
		cell?: DataTableCellSnippet<T>;
		headerCell?: DataTableHeaderSnippet<T>;
	};

	let {
		rows,
		columns,
		ariaLabel = 'Import preview',
		emptyMessage = 'No preview rows.',
		loading = false,
		selection,
		rowKey,
		disabledRow,
		cell,
		headerCell
	}: Props = $props();
	const previewColumns = $derived(
		selection
			? [{ key: 'select', header: '', value: () => '', searchable: false, sortable: false, width: '3rem' }, ...columns]
			: columns
	);
</script>

{#snippet selectionCell(row: T, column: ColumnDef<T>)}
	{#if column.key === 'select' && selection}
		{@const rowIndex = rows.indexOf(row)}
		<DataTable.SelectionCheckbox
			checked={selection.isSelected(row, rowIndex)}
			disabled={disabledRow?.(row) ?? false}
			ariaLabel={`Select import row ${rowIndex + 1}`}
			onCheckedChange={(checked) => selection.toggleRow(row, rowIndex, checked)}
		/>
	{:else if cell}
		{@render cell(row, column)}
	{:else}
		{String(column.value(row) ?? '')}
	{/if}
{/snippet}

{#snippet selectionHeader(column: ColumnDef<T>)}
	{#if column.key === 'select' && selection}
		<DataTable.SelectionCheckbox
			checked={selection.allPageRowsSelected}
			indeterminate={selection.somePageRowsSelected}
			ariaLabel="Select all import rows"
			onCheckedChange={(checked) => selection.toggleAllPageRows(checked)}
		/>
	{:else if headerCell}
		{@render headerCell(column)}
	{:else}
		<span class="inline-flex h-8 items-center">{column.header}</span>
	{/if}
{/snippet}

{#snippet toolbar()}
	{#if selection}
		<DataTable.BulkActions selectedCount={selection.selectedCount} totalCount={rows.length}>
			<Button variant="outline" size="sm" onclick={() => selection.clear()} disabled={selection.selectedCount === 0}>
				Clear
			</Button>
		</DataTable.BulkActions>
	{/if}
{/snippet}

<DataTable.DataTable
	data={rows}
	columns={previewColumns}
	{ariaLabel}
	{emptyMessage}
	{loading}
	{rowKey}
	{disabledRow}
	density="dense"
	stickyHeader
	maxHeight="30rem"
	cell={selectionCell}
	headerCell={selectionHeader}
	toolbar={selection ? toolbar : undefined}
/>
