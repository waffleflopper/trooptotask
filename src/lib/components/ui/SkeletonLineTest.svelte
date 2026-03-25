<script lang="ts">
	import SkeletonLine from './SkeletonLine.svelte';

	interface Props {
		width?: string;
		height?: string;
	}

	let { width, height }: Props = $props();
</script>

<SkeletonLine {width} {height} />
