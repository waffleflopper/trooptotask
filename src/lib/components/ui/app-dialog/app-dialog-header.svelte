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
	data-slot="app-dialog-header"
	class={cn('flex flex-col gap-2 px-4 pt-4', className)}
	{...restProps}
>
	{@render children?.()}
</div>
