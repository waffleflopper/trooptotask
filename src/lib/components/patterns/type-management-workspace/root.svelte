<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<section
	bind:this={ref}
	data-slot="type-management-workspace"
	class={cn('flex h-full min-h-0 flex-col gap-3 bg-background p-2', className)}
	{...restProps}
>
	{@render children?.()}
</section>
