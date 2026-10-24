<script lang="ts" module>
	export interface ProportionBarSegment {
		key: string;
		/** Spoken with the count, so the color is never the only signal. */
		label: string;
		count: number;
		/** Any CSS color, usually a token variable or a catalog color. */
		color: string;
	}
</script>

<script lang="ts">
	import { cn } from '$lib/utils.js';

	let {
		segments,
		label,
		class: className
	}: {
		segments: ProportionBarSegment[];
		/** Names the bar for assistive technology, which hears each segment's label and count. */
		label: string;
		class?: string;
	} = $props();

	const shown = $derived(segments.filter((segment) => segment.count > 0));
</script>

<div
	class={cn('flex h-1.5 w-30 shrink-0 gap-px overflow-clip rounded-[3px] bg-muted-foreground/15', className)}
	role="img"
	aria-label="{label}: {shown.map((segment) => `${segment.count} ${segment.label}`).join(', ')}"
>
	{#each shown as segment (segment.key)}
		<span class="basis-0" style:flex-grow={segment.count} style:background-color={segment.color}></span>
	{/each}
</div>
