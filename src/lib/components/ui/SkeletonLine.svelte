<script lang="ts">
	interface Props {
		width?: string;
		height?: string;
	}

	let { width = '100%', height = '1em' }: Props = $props();
</script>

<div class="skeleton-pulse skeleton-line" data-testid="skeleton-line" aria-hidden="true" style:width style:height></div>

<style>
	.skeleton-line {
		border-radius: var(--skeleton-radius);
	}
</style>
