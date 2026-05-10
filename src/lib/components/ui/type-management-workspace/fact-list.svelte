<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDListElement>> = $props();
</script>

<dl bind:this={ref} data-slot="type-management-workspace-fact-list" class={cn('grid gap-3', className)} {...restProps}>
	{@render children?.()}
</dl>
