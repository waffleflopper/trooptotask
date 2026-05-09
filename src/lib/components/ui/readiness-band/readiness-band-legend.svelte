<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import Swatch from './readiness-band-swatch.svelte';
	import { readinessBandLegendItems, type ReadinessBandLegendItem } from './types.js';

	let {
		items = readinessBandLegendItems,
		ariaLabel = 'Readiness matrix tiers',
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLUListElement>> & {
		items?: ReadinessBandLegendItem[];
		ariaLabel?: string;
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
			<Swatch tier={item.tier} />
			<span>{item.label}</span>
		</li>
	{/each}
</ul>

<style>
	.readiness-band-legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2) var(--sp-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.readiness-band-legend li {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}
</style>
