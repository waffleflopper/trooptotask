<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		label,
		count,
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		label: string;
		count: number;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="kanban-board-column-header"
	class={cn('mb-3 flex items-center gap-2', className)}
	{...restProps}
>
	<h2 class="text-sm font-semibold text-muted-foreground">{label}</h2>
	<span
		class="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground"
	>
		{count}
	</span>
</div>
