<script lang="ts" generics="T">
	import type {
		ColumnDef,
		DataTableCellSnippet,
		DataTableHeaderSnippet,
		DataTableSelectionState
	} from '$lib/components/ui/data-table/index.js';
	import * as DataTable from '$lib/components/ui/data-table/index.js';
	import type { EmptyTitleLevel } from '$lib/components/ui/empty/index.js';
	import { WorkspaceToolbar } from '$lib/components/patterns/workspace-toolbar/index.js';
	import RowStatus from './bulk-import-row-status.svelte';
	import type {
		BulkImportPreviewCellPresentation,
		BulkImportRowStatus,
		BulkImportRowStatusDescriptionMode
	} from './types.js';

	type Props = {
		rows: T[];
		columns: ColumnDef<T>[];
		ariaLabel?: string;
		emptyMessage?: string;
		emptyLevel?: EmptyTitleLevel;
		loading?: boolean;
		selection?: DataTableSelectionState<T>;
		rowKey?: (row: T, index: number) => string | number;
		/** Blocks import selection while leaving cell editors available for correction. */
		disabledRow?: (row: T) => boolean;
		disabledReason?: (row: T, index: number) => string | undefined;
		rowStatus?: (row: T, index: number) => BulkImportRowStatus | undefined;
		statusColumnHeader?: string;
		statusDescriptionMode?: BulkImportRowStatusDescriptionMode;
		cellPresentation?: BulkImportPreviewCellPresentation;
		selectedCountLabel?: (selectedCount: number, totalCount: number) => string;
		cell?: DataTableCellSnippet<T>;
		headerCell?: DataTableHeaderSnippet<T>;
	};

	let {
		rows,
		columns,
		ariaLabel = 'Import preview',
		emptyMessage = 'No preview rows.',
		emptyLevel,
		loading = false,
		selection,
		rowKey,
		disabledRow,
		disabledReason,
		rowStatus,
		statusColumnHeader = 'Status',
		statusDescriptionMode = 'inline',
		cellPresentation = 'default',
		selectedCountLabel,
		cell,
		headerCell
	}: Props = $props();

	const uid = $props.id();
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

	function statusDescriptionId(rowIndex: number): string {
		return `${uid}-row-${rowIndex}-status`;
	}

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
		{@const blocked = disabledRow?.(row) ?? false}
		{@const blockedReason = blocked && shouldShowStatusColumn && resolveRowStatus(row, rowIndex)?.description}
		<DataTable.SelectionCheckbox
			checked={selection.isSelected(row, rowIndex)}
			disabled={blocked}
			invalid={!!blockedReason}
			describedBy={blockedReason ? statusDescriptionId(rowIndex) : undefined}
			ariaLabel={reason ? `Select import row ${rowIndex + 1}: ${reason}` : `Select import row ${rowIndex + 1}`}
			onCheckedChange={(checked) => selection.toggleRow(row, rowIndex, checked)}
		/>
	{:else if column.key === 'import-status'}
		{@const rowIndex = rows.indexOf(row)}
		{@const status = resolveRowStatus(row, rowIndex)}
		{#if status}
			<RowStatus
				tone={status.tone}
				label={status.label}
				description={status.description}
				descriptionMode={statusDescriptionMode}
				descriptionId={statusDescriptionId(rowIndex)}
			/>
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

<div
	data-slot="bulk-import-preview-table"
	data-cell-presentation={cellPresentation}
	class={[
		'grid gap-2',
		cellPresentation === 'editable-grid' &&
			'[&_[data-slot=table-container]]:pb-20 [&_[data-slot=input]]:h-7 [&_[data-slot=input]]:rounded-md [&_[data-slot=input]]:border-transparent [&_[data-slot=input]]:bg-transparent [&_[data-slot=input]]:px-2 [&_[data-slot=input]]:text-sm [&_[data-slot=input]]:shadow-none hover:[&_[data-slot=input]]:border-input [&_[data-slot=input]:focus-visible]:border-ring'
	]}
>
	{#if selection}
		<p class="flex flex-wrap gap-x-3 text-sm text-muted-foreground" aria-live="polite">
			<span>{selection.selectedCount} of {rows.length} selected</span>
			{#if selectedCountLabel}
				<span>{selectedCountLabel(selection.selectedCount, rows.length)}</span>
			{/if}
		</p>
		<WorkspaceToolbar
			ariaLabel="{ariaLabel} selection controls"
			items={[
				{
					kind: 'action',
					id: 'clear',
					label: 'Clear',
					onclick: () => selection.clear(),
					disabled: selection.selectedCount === 0
				}
			]}
		/>
	{/if}
	<DataTable.DataTable
		data={rows}
		columns={previewColumns}
		{ariaLabel}
		{emptyMessage}
		{emptyLevel}
		{loading}
		{rowKey}
		density="dense"
		stickyHeader
		maxHeight="30rem"
		cell={selectionCell}
		headerCell={selectionHeader}
	/>
</div>
