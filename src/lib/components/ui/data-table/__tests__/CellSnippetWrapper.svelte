<script lang="ts">
	import DataTable from '../DataTable.svelte';
	import type { ColumnDef } from '../../data-table/useDataTable.svelte';

	interface TestRow {
		id: string;
		name: string;
		age: number;
		group: string;
	}

	let { data, columns }: { data: TestRow[]; columns: ColumnDef<TestRow>[] } = $props();
</script>

<DataTable {data} {columns}>
	{#snippet cell(row: TestRow, col: ColumnDef<TestRow>)}
		<span data-testid="custom-cell">{col.key}:{String(col.value(row))}</span>
	{/snippet}
</DataTable>
