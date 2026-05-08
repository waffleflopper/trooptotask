<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
	}

	let { children }: Props = $props();
</script>

<thead class="operational-matrix-header" data-slot="operational-matrix-header">
	{@render children?.()}
</thead>

<style>
	.operational-matrix-header {
		position: sticky;
		top: 0;
		z-index: 20;
		background: var(--muted);
	}
</style>
