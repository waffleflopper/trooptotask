<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		ariaLabel: string;
		children?: Snippet;
	}

	let { ariaLabel, children }: Props = $props();
</script>

<table class="operational-matrix-table" data-slot="operational-matrix-table" aria-label={ariaLabel}>
	{@render children?.()}
</table>

<style>
	.operational-matrix-table {
		width: max-content;
		min-width: var(--matrix-table-min-width);
		border-collapse: separate;
		border-spacing: 0;
		table-layout: fixed;
		font-size: 0.8125rem;
	}
</style>
