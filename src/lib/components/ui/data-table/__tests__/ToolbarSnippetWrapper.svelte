<script lang="ts">
	import DataTable from '../DataTable.svelte';
	import type { ColumnDef, DataTableState } from '../../data-table/useDataTable.svelte';

	interface TestRow {
		id: string;
		name: string;
		age: number;
		group: string;
	}

	let { data, columns }: { data: TestRow[]; columns: ColumnDef<TestRow>[] } = $props();
</script>

<DataTable {data} {columns}>
	{#snippet toolbar(state: DataTableState<TestRow>)}
		<div data-testid="custom-toolbar">Total: {state.totalRows}</div>
	{/snippet}
</DataTable>
