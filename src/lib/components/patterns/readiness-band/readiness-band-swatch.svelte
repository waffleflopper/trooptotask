<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { readinessBandSwatchFill, type ReadinessBandPalette, type ReadinessBandTier } from './types.js';

	let {
		tier,
		palette = 'ramp',
		drop = false,
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLSpanElement>> & {
		tier: ReadinessBandTier;
		palette?: ReadinessBandPalette;
		/** Draws the upcoming hot-spot marker instead of a tier fill. */
		drop?: boolean;
	} = $props();
</script>

<span
	data-slot="readiness-band-swatch"
	data-tier={tier}
	aria-hidden="true"
	class={cn(
		'inline-block size-2.5 rounded-[1px] border-[0.5px] border-foreground/36',
		drop ? 'inset-ring-2 inset-ring-foreground' : readinessBandSwatchFill[palette][tier],
		className
	)}
	{...restProps}
></span>
