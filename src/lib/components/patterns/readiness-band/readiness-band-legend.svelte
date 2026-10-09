<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import Swatch from './readiness-band-swatch.svelte';
	import { readinessBandLegendItems, type ReadinessBandLegendItem, type ReadinessBandPalette } from './types.js';

	let {
		items = readinessBandLegendItems,
		ariaLabel = 'Readiness matrix tiers',
		palette = 'ramp',
		dropLabel,
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLUListElement>> & {
		items?: ReadinessBandLegendItem[];
		ariaLabel?: string;
		palette?: ReadinessBandPalette;
		/** Key for the upcoming hot-spot marker drawn by a cell's `drop`. */
		dropLabel?: string;
	} = $props();
</script>

<ul
	aria-label={ariaLabel}
	data-slot="readiness-band-legend"
	class={cn('readiness-band-legend', className)}
	{...restProps}
>
	{#each items as item (item.tier)}
		<li>
			<Swatch tier={item.tier} {palette} />
			<span>{item.label}</span>
		</li>
	{/each}
	{#if dropLabel}
		<li>
			<Swatch tier="not-applicable" {palette} data-drop="" />
			<span>{dropLabel}</span>
		</li>
	{/if}
</ul>

<style>
	.readiness-band-legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.readiness-band-legend li {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.625rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}
</style>
