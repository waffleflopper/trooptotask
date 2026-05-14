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
	data-slot="app-dialog-footer"
	class={cn('flex shrink-0 flex-col-reverse gap-2 px-4 pt-0 pb-4 sm:flex-row sm:justify-end', className)}
	{...restProps}
>
	{@render children?.()}
</div>
