<script lang="ts">
	import DataTable from '../DataTable.svelte';
	import type { ColumnDef } from '../../data-table/useDataTable.svelte';

	interface TestRow {
		id: string;
		name: string;
		age: number;
		group: string;
	}

	let {
		data,
		columns,
		onRowClick,
		onButtonClick
	}: {
		data: TestRow[];
		columns: ColumnDef<TestRow>[];
		onRowClick: (row: TestRow) => void;
		onButtonClick: (row: TestRow) => void;
	} = $props();
</script>

<DataTable {data} {columns} {onRowClick} rowActionLabel={(row) => `Open ${row.name}`}>
	{#snippet cell(row: TestRow, col: ColumnDef<TestRow>)}
		{#if col.key === 'actions'}
			<button type="button" onclick={() => onButtonClick(row)}>Action {row.name}</button>
		{:else}
			{String(col.value(row))}
		{/if}
	{/snippet}
</DataTable>
