<script lang="ts">
	interface Props {
		rows?: number;
		columns?: number;
		cellWidth?: string;
		cellHeight?: string;
		gap?: string;
	}

	let { rows = 3, columns = 5, cellWidth = '100px', cellHeight = '38px', gap = 'var(--spacing-sm)' }: Props = $props();

	const cellCount = $derived(rows * columns);
</script>

<div
	class="skeleton-grid"
	data-testid="skeleton-grid"
	aria-hidden="true"
	style:grid-template-columns="repeat({columns}, {cellWidth})"
	style:gap
>
	{#each Array(cellCount) as _, i (i)}
		<div class="skeleton-pulse skeleton-grid-cell" data-testid="skeleton-grid-cell" style:height={cellHeight}></div>
	{/each}
</div>

<style>
	.skeleton-grid {
		display: grid;
	}

	.skeleton-grid-cell {
		border-radius: var(--skeleton-radius);
	}
</style>
