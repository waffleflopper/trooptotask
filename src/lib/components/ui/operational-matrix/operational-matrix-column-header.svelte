<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
		label: string;
		description?: string;
		compactLabel?: string;
		abbr?: string;
		rotated?: boolean;
	}

	let { children, label, description, compactLabel, abbr, rotated = false }: Props = $props();
</script>

<th
	scope="col"
	class="operational-matrix-column-header"
	data-slot="operational-matrix-column-header"
	data-rotated={rotated ? 'true' : undefined}
	aria-label={description ? `${label}: ${description}` : label}
	title={description ?? label}
>
	<span class="column-header-inner" aria-hidden={compactLabel || abbr || children ? 'true' : undefined}>
		{#if children}
			{@render children()}
		{:else}
			<span class="column-header-primary">{abbr ?? compactLabel ?? label}</span>
			{#if description}
				<span class="column-header-secondary">{description}</span>
			{/if}
		{/if}
	</span>
</th>

<style>
	.operational-matrix-column-header {
		position: sticky;
		top: 0;
		z-index: 20;
		width: var(--matrix-cell-width);
		min-width: var(--matrix-cell-width);
		max-width: var(--matrix-cell-width);
		height: var(--matrix-header-height);
		padding: 0.5rem;
		border-right: 1px solid var(--matrix-rule);
		border-bottom: 1px solid var(--matrix-rule-strong);
		background: var(--muted);
		color: var(--foreground);
		font-weight: 600;
		text-align: left;
		vertical-align: bottom;
	}

	.column-header-inner {
		display: grid;
		gap: 0.25rem;
		min-width: 0;
	}

	.column-header-primary,
	.column-header-secondary {
		display: block;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.column-header-primary {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.column-header-secondary {
		color: var(--muted-foreground);
		font-size: 0.6875rem;
		font-weight: 500;
	}

	.operational-matrix-column-header[data-rotated='true'] {
		width: var(--matrix-cell-width);
		min-width: var(--matrix-cell-width);
		max-width: var(--matrix-cell-width);
		height: 8rem;
		padding: 0;
	}

	.operational-matrix-column-header[data-rotated='true'] .column-header-inner {
		position: absolute;
		bottom: 0.625rem;
		left: calc(var(--matrix-cell-width) - 0.125rem);
		width: 6.5rem;
		transform: rotate(-90deg);
		transform-origin: left bottom;
	}
</style>
