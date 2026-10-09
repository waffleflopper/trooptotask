<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		children,
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		children?: Snippet;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="kanban-board-column-items"
	class={cn('flex flex-1 flex-col gap-2 overflow-y-auto', className)}
	{...restProps}
>
	{@render children?.()}
</div>
