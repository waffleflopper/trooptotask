<script lang="ts">
	import DataTable from '../DataTable.svelte';
	import type { ColumnDef } from '../types.js';

	type Row = {
		id: string;
		name: string;
		age: number;
		group: string;
	};

	let {
		data,
		columns,
		onRowClick,
		onButtonClick
	}: {
		data: Row[];
		columns: ColumnDef<Row>[];
		onRowClick: (row: Row) => void;
		onButtonClick: (row: Row) => void;
	} = $props();
</script>

<DataTable {data} {columns} {onRowClick} rowActionLabel={(row) => `Open ${row.name}`}>
	{#snippet cell(row: Row, column: ColumnDef<Row>)}
		{#if column.key === 'actions'}
			<button type="button" onclick={() => onButtonClick(row)}>Action {row.name}</button>
		{:else}
			{String(column.value(row))}
		{/if}
	{/snippet}
</DataTable>
