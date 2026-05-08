<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
		label?: string;
	}

	let { children, label = 'Rows' }: Props = $props();
</script>

<th scope="col" class="operational-matrix-corner" data-slot="operational-matrix-corner">
	<span>{label}</span>
	{@render children?.()}
</th>

<style>
	.operational-matrix-corner {
		position: sticky;
		top: 0;
		left: 0;
		z-index: 30;
		width: var(--matrix-row-header-width);
		min-width: var(--matrix-row-header-width);
		max-width: var(--matrix-row-header-width);
		height: var(--matrix-header-height);
		padding: 0.625rem 0.75rem;
		border-right: 1px solid var(--matrix-rule-strong);
		border-bottom: 1px solid var(--matrix-rule-strong);
		background: var(--muted);
		color: var(--muted-foreground);
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-align: left;
		text-transform: uppercase;
		vertical-align: bottom;
	}
</style>
