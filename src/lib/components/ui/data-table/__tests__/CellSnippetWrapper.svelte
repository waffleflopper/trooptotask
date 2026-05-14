<script lang="ts">
	import DataTable from '../DataTable.svelte';
	import type { ColumnDef } from '../types.js';

	type Row = {
		id: string;
		name: string;
		age: number;
		group: string;
	};

	let { data, columns }: { data: Row[]; columns: ColumnDef<Row>[] } = $props();
</script>

<DataTable {data} {columns}>
	{#snippet cell(row: Row, column: ColumnDef<Row>)}
		<span data-testid="custom-cell">{column.key}:{String(column.value(row))}</span>
	{/snippet}
</DataTable>
