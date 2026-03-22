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
	{#snippet headerCell(col: ColumnDef<TestRow>)}
		<span data-testid="custom-header">HD:{col.header}</span>
	{/snippet}
</DataTable>
