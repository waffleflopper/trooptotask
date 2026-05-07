<script lang="ts">
	import DataTable from '../DataTable.svelte';
	import DataTableSelectionCheckbox from '../data-table-selection-checkbox.svelte';
	import DataTableBulkActions from '../data-table-bulk-actions.svelte';
	import { useDataTableSelection } from '../useDataTableSelection.svelte';
	import type { ColumnDef } from '../types.js';

	type Row = {
		id: string;
		name: string;
		disabled?: boolean;
	};

	const data: Row[] = [
		{ id: '1', name: 'Alpha' },
		{ id: '2', name: 'Bravo' },
		{ id: '3', name: 'Charlie', disabled: true }
	];

	const columns: ColumnDef<Row>[] = [
		{ key: 'select', header: 'Select', value: () => '', sortable: false, searchable: false },
		{ key: 'name', header: 'Name', value: (row) => row.name }
	];

	const selection = useDataTableSelection({
		rows: () => data,
		rowKey: (row) => row.id,
		disabledRow: (row) => row.disabled ?? false
	});
</script>

<DataTable {data} {columns} disabledRow={(row) => row.disabled ?? false}>
	{#snippet toolbar()}
		<DataTableBulkActions selectedCount={selection.selectedCount} totalCount={data.length} />
	{/snippet}
	{#snippet headerCell(column: ColumnDef<Row>)}
		{#if column.key === 'select'}
			<DataTableSelectionCheckbox
				checked={selection.allPageRowsSelected}
				indeterminate={selection.somePageRowsSelected}
				ariaLabel="Select all rows"
				onCheckedChange={(checked) => selection.toggleAllPageRows(checked)}
			/>
		{:else}
			{column.header}
		{/if}
	{/snippet}
	{#snippet cell(row: Row, column: ColumnDef<Row>)}
		{#if column.key === 'select'}
			<DataTableSelectionCheckbox
				checked={selection.isSelected(row, data.indexOf(row))}
				disabled={row.disabled}
				ariaLabel={`Select ${row.name}`}
				onCheckedChange={(checked) => selection.toggleRow(row, data.indexOf(row), checked)}
			/>
		{:else}
			{row.name}
		{/if}
	{/snippet}
</DataTable>
