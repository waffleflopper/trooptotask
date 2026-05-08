<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		meta?: string;
		colspan: number;
		children?: Snippet;
	}

	let { label, meta, colspan, children }: Props = $props();
</script>

<tr class="operational-matrix-group-row" data-slot="operational-matrix-row-group">
	<th scope="rowgroup" {colspan}>
		<span class="group-label">
			<span>{label}</span>
			{#if meta}
				<span class="group-meta">{meta}</span>
			{/if}
		</span>
		{@render children?.()}
	</th>
</tr>

<style>
	.operational-matrix-group-row th {
		position: sticky;
		left: 0;
		z-index: 12;
		height: 2.25rem;
		padding: 0.5rem 0.75rem;
		border-top: 1px solid var(--matrix-rule-strong);
		border-bottom: 1px solid var(--matrix-rule-strong);
		background: color-mix(in srgb, var(--muted) 86%, var(--card) 14%);
		color: var(--foreground);
		text-align: left;
	}

	.group-label {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.group-meta {
		color: var(--muted-foreground);
		font-weight: 500;
		letter-spacing: 0.04em;
		text-transform: none;
	}
</style>
