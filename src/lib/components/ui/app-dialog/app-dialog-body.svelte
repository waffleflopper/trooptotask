<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { cn, type WithElementRef } from '$lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>, HTMLDivElement> & { children?: Snippet } = $props();
</script>

<div
	bind:this={ref}
	data-slot="app-dialog-body"
	class={cn('min-h-0 overflow-y-auto px-4 py-4 text-sm', className)}
	{...restProps}
>
	{@render children?.()}
</div>
