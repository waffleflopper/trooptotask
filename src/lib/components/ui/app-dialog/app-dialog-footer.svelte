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

	const { tone, voice } = getAppDialogState();
</script>

<div
	bind:this={ref}
	data-slot="app-dialog-footer"
	class={cn(
		'flex shrink-0 flex-col-reverse gap-2 px-4 pt-0 pb-4 sm:flex-row sm:justify-end',
		tone === 'destructive' && 'border-t border-border bg-muted px-7 py-3.5 sm:items-center',
		tone !== 'destructive' && voice === 'editorial' && 'px-7 pb-6',
		tone !== 'destructive' && voice === 'form' && 'border-t border-border bg-muted px-6 py-3.5 sm:items-center',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
