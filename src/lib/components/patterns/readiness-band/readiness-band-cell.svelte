<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import {
		formatReadinessBandPercent,
		readinessBandCellPalette,
		type ReadinessBandPalette,
		type ReadinessBandTier
	} from './types.js';

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
	class={cn(
		'inline-grid place-items-center content-center rounded-sm border font-mono text-[0.6875rem] tabular-nums',
		readinessBandCellPalette[palette].base,
		readinessBandCellPalette[palette].tiers[tier],
		size === 'tile' ? 'h-13 w-full gap-0.5 text-[0.9375rem]' : 'h-7 w-[3.625rem]',
		drop !== null && 'relative inset-ring-2 inset-ring-foreground',
		className
	)}
	{...restProps}
	>{#if children}{@render children()}{:else}{displayValue}{/if}{#if drop !== null}<span
			class="rounded-sm bg-foreground px-1 text-[0.625rem] leading-4 font-semibold text-background"
			><span aria-hidden="true">▼ {drop}</span><span class="sr-only">, drops {drop} points</span></span
		>{/if}</span
>
