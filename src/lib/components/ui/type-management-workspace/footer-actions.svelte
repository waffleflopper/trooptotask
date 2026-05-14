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
	data-slot="type-management-workspace-footer-actions"
	class={cn('flex items-center gap-3 border-t border-border pt-4', className)}
	{...restProps}
>
	{@render children?.()}
</div>
