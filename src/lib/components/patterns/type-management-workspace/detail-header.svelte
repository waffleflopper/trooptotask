<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	interface Props extends WithElementRef<HTMLAttributes<HTMLDivElement>, HTMLDivElement> {
		title: string;
		color?: string;
	}

	let { ref = $bindable(null), class: className, title, color, ...restProps }: Props = $props();
</script>

<div
	bind:this={ref}
	data-slot="type-management-workspace-detail-header"
	class={cn('flex min-w-0 items-center gap-3 border-b border-border pb-4', className)}
	{...restProps}
>
	{#if color}
		<span
			data-slot="type-management-workspace-detail-swatch"
			class="size-4 shrink-0 rounded-sm border border-border/60"
			style:background-color={color}
		></span>
	{/if}
	<h3
		tabindex="-1"
		data-slot="type-management-workspace-detail-heading"
		class="truncate text-xl font-semibold text-foreground outline-none"
	>
		{title}
	</h3>
</div>
