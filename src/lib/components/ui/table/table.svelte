<script lang="ts">
	import type { HTMLTableAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		containerClass,
		scrollRegionLabel,
		children,
		...restProps
	}: WithElementRef<HTMLTableAttributes> & {
		/** Names the scroll container as a focusable region so keyboard users can scroll a wide table. */
		scrollRegionLabel?: string;
		/** Sizes the scroll container, for a table that scrolls vertically inside its own region. */
		containerClass?: string;
	} = $props();
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	data-slot="table-container"
	class={cn(
		'relative w-full overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
		containerClass
	)}
	role={scrollRegionLabel ? 'region' : undefined}
	aria-label={scrollRegionLabel}
	tabindex={scrollRegionLabel ? 0 : undefined}
>
	<table bind:this={ref} data-slot="table" class={cn('w-full caption-bottom text-sm', className)} {...restProps}>
		{@render children?.()}
	</table>
</div>
