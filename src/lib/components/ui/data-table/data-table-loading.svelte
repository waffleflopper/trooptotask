<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import * as Table from '$lib/components/ui/table/index.js';

	type Props = {
		columns: number;
		rows?: number;
		label?: string;
	};

	let { columns, rows = 5, label = 'Loading table rows' }: Props = $props();
</script>

<Table.Body aria-label={label} aria-busy="true">
	{#each { length: rows } as _, rowIndex (rowIndex)}
		<Table.Row>
			{#each { length: columns } as _, columnIndex (columnIndex)}
				<Table.Cell>
					<Skeleton class="h-4 w-full max-w-40" />
				</Table.Cell>
			{/each}
		</Table.Row>
	{/each}
</Table.Body>
