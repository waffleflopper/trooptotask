<script lang="ts">
	import SkeletonGrid from './SkeletonGrid.svelte';

	interface Props {
		rows?: number;
		columns?: number;
		cellWidth?: string;
		cellHeight?: string;
		gap?: string;
	}

	let { rows, columns, cellWidth, cellHeight, gap }: Props = $props();
</script>

<SkeletonGrid {rows} {columns} {cellWidth} {cellHeight} {gap} />
