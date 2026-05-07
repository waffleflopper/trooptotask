<script lang="ts">
	import DataTable from '../DataTable.svelte';
	import type { ColumnDef } from '../types.js';

	type TestRow = {
		id: string;
		name: string;
		age: number;
		group: string;
	};

	interface Props {
		data: TestRow[];
		columns: ColumnDef<TestRow>[];
		onGroupAction: (groupKey: string) => void;
	}

	let { data, columns, onGroupAction }: Props = $props();
</script>

<DataTable {data} {columns} groupBy={{ key: (row) => row.group, label: (key) => `Group ${key}` }}>
	{#snippet groupHeader(group)}
		<button type="button" onclick={() => onGroupAction(group.key)}>Pin {group.label}</button>
		<span>{group.label}</span>
		<span>{group.count}</span>
	{/snippet}
</DataTable>
