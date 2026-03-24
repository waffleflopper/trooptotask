<script lang="ts">
	interface Props {
		width?: string;
		height?: string;
		borderRadius?: string;
	}

	let { width = '100%', height = '80px', borderRadius }: Props = $props();
</script>

<div
	class="skeleton-pulse skeleton-block"
	data-testid="skeleton-block"
	aria-hidden="true"
	style:width
	style:height
	style:border-radius={borderRadius}
></div>

<style>
	.skeleton-block {
		border-radius: var(--skeleton-radius);
	}
</style>
