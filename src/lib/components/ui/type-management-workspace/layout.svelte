<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="type-management-workspace-layout"
	class={cn('grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]', className)}
	{...restProps}
>
	{@render children?.()}
</div>
