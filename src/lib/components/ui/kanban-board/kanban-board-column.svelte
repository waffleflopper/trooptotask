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
	data-slot="kanban-board-column"
	class={cn('flex w-72 shrink-0 flex-col', className)}
	{...restProps}
>
	{@render children?.()}
</div>
