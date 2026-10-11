<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<!-- A div, not shadcn's main: each shell renders its own main around page content, apart from its header. -->
<div
	bind:this={ref}
	data-slot="sidebar-inset"
	class={cn(
		'bg-background md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2 relative flex min-h-0 w-full min-w-0 flex-1 flex-col',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
