<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { formatReadinessBandPercent, type ReadinessBandTier } from './types.js';

	let {
		tier,
		percent,
		label,
		children,
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLSpanElement>> & {
		tier: ReadinessBandTier;
		percent?: number | null;
		label?: string;
		children?: Snippet;
	} = $props();

	const displayValue = $derived(label ?? formatReadinessBandPercent(percent ?? null));
</script>

<span data-slot="readiness-band-cell" data-tier={tier} class={cn('readiness-band-cell', className)} {...restProps}>
	{#if children}
		{@render children()}
	{:else}
		{displayValue}
	{/if}
</span>

<style>
	.readiness-band-cell {
		--readiness-band-danger: #e8b9a8;
		--readiness-band-warn: #eca382;
		--readiness-band-caution: #f2c878;
		--readiness-band-okay: #c5d89b;
		--readiness-band-good: #9bc361;
		--readiness-band-na-a: color-mix(in srgb, var(--muted) 76%, var(--card) 24%);
		--readiness-band-na-b: color-mix(in srgb, var(--border) 72%, var(--card) 28%);

		display: inline-grid;
		width: 3.625rem;
		height: 1.75rem;
		place-items: center;
		border: 1px solid color-mix(in srgb, var(--foreground) 16%, transparent);
		border-radius: 2px;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: #24211d;
	}

	.readiness-band-cell[data-tier='danger'] {
		background: var(--readiness-band-danger);
	}

	.readiness-band-cell[data-tier='warn'] {
		background: var(--readiness-band-warn);
	}

	.readiness-band-cell[data-tier='caution'] {
		background: var(--readiness-band-caution);
	}

	.readiness-band-cell[data-tier='okay'] {
		background: var(--readiness-band-okay);
	}

	.readiness-band-cell[data-tier='good'] {
		background: var(--readiness-band-good);
	}

	.readiness-band-cell[data-tier='not-applicable'] {
		background: repeating-linear-gradient(
			45deg,
			var(--readiness-band-na-a),
			var(--readiness-band-na-a) 3px,
			var(--readiness-band-na-b) 3px,
			var(--readiness-band-na-b) 6px
		);
		color: var(--muted-foreground);
	}
</style>
