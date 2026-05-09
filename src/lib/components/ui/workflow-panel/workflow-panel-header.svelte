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
	data-slot="workflow-panel-header"
	class={cn('flex min-w-0 flex-col gap-1 border-b border-border px-4 py-3', className)}
	{...restProps}
>
	{@render children?.()}
</div>
