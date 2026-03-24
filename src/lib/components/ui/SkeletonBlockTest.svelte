<script lang="ts">
	import SkeletonBlock from './SkeletonBlock.svelte';

	interface Props {
		width?: string;
		height?: string;
		borderRadius?: string;
	}

	let { width, height, borderRadius }: Props = $props();
</script>

<SkeletonBlock {width} {height} {borderRadius} />
