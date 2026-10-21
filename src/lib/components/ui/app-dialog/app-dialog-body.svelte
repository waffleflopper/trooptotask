<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { cn, type WithElementRef } from '$lib/utils';
	import { getAppDialogState } from './app-dialog-context';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>, HTMLDivElement> & { children?: Snippet } = $props();

	const destructive = getAppDialogState().tone === 'destructive';
</script>

<div
	bind:this={ref}
	data-slot="app-dialog-body"
	class={cn('min-h-0 overflow-y-auto px-4 py-4 text-sm', destructive && 'px-7 py-5', className)}
	{...restProps}
>
	{@render children?.()}
</div>
