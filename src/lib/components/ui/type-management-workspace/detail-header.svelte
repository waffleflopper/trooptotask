<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	interface Props extends WithElementRef<HTMLAttributes<HTMLDivElement>, HTMLDivElement> {
		title: string;
		color?: string;
		actions?: Snippet;
	}

	let { ref = $bindable(null), class: className, title, color, actions, ...restProps }: Props = $props();
</script>

<div
	bind:this={ref}
	data-slot="type-management-workspace-detail-header"
	class={cn(
		'flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between',
		className
	)}
	{...restProps}
>
	<div class="flex min-w-0 items-center gap-3">
		{#if color}
			<span
				data-slot="type-management-workspace-detail-swatch"
				class="size-4 shrink-0 rounded-sm border border-border/60"
				style:background-color={color}
			></span>
		{/if}
		<h3 class="truncate text-xl font-semibold text-foreground">{title}</h3>
	</div>
	{#if actions}
		<div data-slot="type-management-workspace-detail-actions" class="flex shrink-0 items-center gap-2">
			{@render actions()}
		</div>
	{/if}
</div>
