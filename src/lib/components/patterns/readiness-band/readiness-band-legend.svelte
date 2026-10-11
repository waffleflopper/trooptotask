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
	class={cn('m-0 flex list-none flex-wrap items-center gap-x-4 gap-y-2 p-0', className)}
	{...restProps}
>
	{#each items as item (item.tier)}
		<li
			class="inline-flex items-center gap-1.5 font-mono text-[0.625rem] tracking-[0.08em] text-muted-foreground uppercase"
		>
			<Swatch tier={item.tier} {palette} />
			<span>{item.label}</span>
		</li>
	{/each}
	{#if dropLabel}
		<li
			class="inline-flex items-center gap-1.5 font-mono text-[0.625rem] tracking-[0.08em] text-muted-foreground uppercase"
		>
			<Swatch tier="not-applicable" {palette} drop />
			<span>{dropLabel}</span>
		</li>
	{/if}
</ul>
