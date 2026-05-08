<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';

	interface Props {
		rows?: number;
		columns?: number;
		label?: string;
	}

	let { rows = 6, columns = 5, label = 'Loading operational matrix' }: Props = $props();
</script>

<div
	class="operational-matrix-loading"
	data-slot="operational-matrix-loading"
	role="status"
	aria-label={label}
	style:--matrix-loading-columns={columns - 1}
>
	{#each Array.from({ length: rows }) as _, rowIndex (rowIndex)}
		{#each Array.from({ length: columns }) as _, columnIndex (`${rowIndex}-${columnIndex}`)}
			<Skeleton class={columnIndex === 0 ? 'loading-row-header' : 'loading-cell'} />
		{/each}
	{/each}
</div>

<style>
	.operational-matrix-loading {
		display: grid;
		grid-template-columns: var(--matrix-row-header-width) repeat(
				var(--matrix-loading-columns, 4),
				var(--matrix-cell-width)
			);
		gap: 1px;
		padding: 0.75rem;
		overflow: hidden;
		background: var(--card);
	}

	:global(.loading-row-header),
	:global(.loading-cell) {
		height: var(--matrix-row-min-height);
		border-radius: var(--radius-sm);
	}
</style>
