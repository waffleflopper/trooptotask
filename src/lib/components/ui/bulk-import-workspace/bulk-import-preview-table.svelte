<script lang="ts" generics="T">
	import type {
		ColumnDef,
		DataTableCellSnippet,
		DataTableHeaderSnippet,
		DataTableSelectionState
	} from '$lib/components/ui/data-table/index.js';
	import * as DataTable from '$lib/components/ui/data-table/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import RowStatus from './bulk-import-row-status.svelte';
	import type { BulkImportRowStatus } from './types.js';

	type Props = {
		rows: T[];
		columns: ColumnDef<T>[];
		ariaLabel?: string;
		emptyMessage?: string;
		loading?: boolean;
		selection?: DataTableSelectionState<T>;
		rowKey?: (row: T, index: number) => string | number;
		disabledRow?: (row: T) => boolean;
		disabledReason?: (row: T, index: number) => string | undefined;
		rowStatus?: (row: T, index: number) => BulkImportRowStatus | undefined;
		statusColumnHeader?: string;
		selectedCountLabel?: (selectedCount: number, totalCount: number) => string;
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
		disabledReason,
		rowStatus,
		statusColumnHeader = 'Status',
		selectedCountLabel,
		cell,
		headerCell
	}: Props = $props();

	const shouldShowStatusColumn = $derived(!!rowStatus || !!disabledReason);
	const previewColumns = $derived([
		...(selection
			? [{ key: 'select', header: '', value: () => '', searchable: false, sortable: false, width: '3rem' }]
			: []),
		...(shouldShowStatusColumn
			? [
					{
						key: 'import-status',
						header: statusColumnHeader,
						value: () => '',
						searchable: false,
						sortable: false,
						width: '12rem'
					}
				]
			: []),
		...columns
	]);

	function resolveRowStatus(row: T, rowIndex: number): BulkImportRowStatus | undefined {
		const explicitStatus = rowStatus?.(row, rowIndex);
		if (explicitStatus) return explicitStatus;

		const reason = disabledReason?.(row, rowIndex);
		if (reason) {
			return { tone: 'disabled', description: reason };
		}

		return undefined;
	}
</script>

{#snippet selectionCell(row: T, column: ColumnDef<T>)}
	{#if column.key === 'select' && selection}
		{@const rowIndex = rows.indexOf(row)}
		{@const reason = disabledReason?.(row, rowIndex)}
		<DataTable.SelectionCheckbox
			checked={selection.isSelected(row, rowIndex)}
			disabled={disabledRow?.(row) ?? false}
			ariaLabel={reason ? `Select import row ${rowIndex + 1}: ${reason}` : `Select import row ${rowIndex + 1}`}
			onCheckedChange={(checked) => selection.toggleRow(row, rowIndex, checked)}
		/>
	{:else if column.key === 'import-status'}
		{@const status = resolveRowStatus(row, rows.indexOf(row))}
		{#if status}
			<RowStatus tone={status.tone} label={status.label} description={status.description} />
		{/if}
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
			{#if selectedCountLabel}
				<span class="text-sm text-muted-foreground">{selectedCountLabel(selection.selectedCount, rows.length)}</span>
			{/if}
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
