<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { formatReadinessBandPercent, type ReadinessBandPalette, type ReadinessBandTier } from './types.js';

	let {
		tier,
		percent,
		label,
		palette = 'ramp',
		size = 'compact',
		drop = null,
		children,
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLSpanElement>> & {
		tier: ReadinessBandTier;
		percent?: number | null;
		label?: string;
		palette?: ReadinessBandPalette;
		/** `tile` fills its column for a briefing grid; `compact` is the fixed matrix chip. */
		size?: 'compact' | 'tile';
		/** Points lost by the horizon; marks an upcoming hot spot with an inset ring and a ▼ chip. */
		drop?: number | null;
		children?: Snippet;
	} = $props();

	const displayValue = $derived(label ?? formatReadinessBandPercent(percent ?? null));
</script>

<span
	data-slot="readiness-band-cell"
	data-tier={tier}
	data-palette={palette}
	data-size={size}
	data-drop={drop ?? undefined}
	class={cn('readiness-band-cell', className)}
	{...restProps}
	>{#if children}{@render children()}{:else}{displayValue}{/if}{#if drop !== null}<span class="readiness-band-drop"
			><span aria-hidden="true">▼ {drop}</span><span class="sr-only">, drops {drop} points</span></span
		>{/if}</span
>

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
		align-content: center;
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

	.readiness-band-cell[data-palette='semantic'] {
		border-color: transparent;
		color: var(--foreground);
		font-weight: 500;
	}

	.readiness-band-cell[data-palette='semantic'][data-tier='good'] {
		background: color-mix(in srgb, var(--chart-2) 14%, transparent);
	}

	.readiness-band-cell[data-palette='semantic'][data-tier='okay'] {
		background: color-mix(in srgb, var(--accent) 12%, transparent);
	}

	.readiness-band-cell[data-palette='semantic'][data-tier='caution'] {
		background: color-mix(in srgb, var(--accent) 28%, transparent);
	}

	.readiness-band-cell[data-palette='semantic'][data-tier='warn'] {
		background: color-mix(in srgb, var(--destructive) 18%, transparent);
	}

	.readiness-band-cell[data-palette='semantic'][data-tier='danger'] {
		background: var(--destructive);
		color: var(--background);
		font-weight: 600;
	}

	.readiness-band-cell[data-palette='semantic'][data-tier='not-applicable'] {
		background: none;
		box-shadow: inset 0 0 0 1px var(--border);
		color: var(--muted-foreground);
	}

	.readiness-band-cell[data-size='tile'] {
		width: 100%;
		height: 3.25rem;
		gap: 0.125rem;
		font-size: 0.9375rem;
	}

	.readiness-band-cell[data-drop] {
		position: relative;
		box-shadow: inset 0 0 0 2px var(--foreground);
	}

	.readiness-band-drop {
		padding: 0 0.25rem;
		border-radius: 2px;
		background: var(--foreground);
		color: var(--background);
		font-size: 0.625rem;
		font-weight: 600;
		line-height: 1rem;
	}
</style>
