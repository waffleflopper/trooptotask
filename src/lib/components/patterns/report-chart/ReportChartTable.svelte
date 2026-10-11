<script lang="ts">
	import * as Table from '$lib/components/ui/table';

	export interface ReportChartTableRow {
		key: string;
		/** The first cell names the row; the rest line up with the remaining columns. */
		cells: Array<string | number>;
	}

	interface Props {
		label: string;
		columns: string[];
		rows: ReportChartTableRow[];
	}

	let { label, columns, rows }: Props = $props();
</script>

<div class="sr-only">
	<Table.Root aria-label={label}>
		<Table.Header>
			<Table.Row>
				{#each columns as column, index (index)}
					<Table.Head scope="col">{column}</Table.Head>
				{/each}
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each rows as { key, cells } (key)}
				<Table.Row>
					<Table.Head scope="row">{cells[0]}</Table.Head>
					{#each cells.slice(1) as cell, index (index)}
						<Table.Cell>{cell}</Table.Cell>
					{/each}
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>
