<script lang="ts" module>
	export type EmptyTitleLevel = 2 | 3 | 4;
</script>

<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		level = 2,
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLHeadingElement>> & { level?: EmptyTitleLevel } = $props();
</script>

<svelte:element
	this={`h${level}`}
	bind:this={ref}
	data-slot="empty-title"
	class={cn('text-sm font-medium tracking-tight', className)}
	{...restProps}
>
	{@render children?.()}
</svelte:element>
