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
	data-slot="type-management-workspace-detail"
	class={cn('min-h-0 overflow-y-auto', className)}
	{...restProps}
>
	{@render children?.()}
</section>
