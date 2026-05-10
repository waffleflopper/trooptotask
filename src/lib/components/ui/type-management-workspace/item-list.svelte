<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLUListElement>> = $props();
</script>

<ul bind:this={ref} data-slot="type-management-workspace-item-list" class={cn('grid gap-2', className)} {...restProps}>
	{@render children?.()}
</ul>
