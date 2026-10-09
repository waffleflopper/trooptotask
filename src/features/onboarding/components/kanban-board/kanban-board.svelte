<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		ariaLabel = 'Kanban board',
		children,
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		ariaLabel?: string;
		children?: Snippet;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="kanban-board"
	aria-label={ariaLabel}
	role="region"
	class={cn('flex min-h-0 flex-1 gap-4 overflow-x-auto', className)}
	{...restProps}
>
	{@render children?.()}
</div>
