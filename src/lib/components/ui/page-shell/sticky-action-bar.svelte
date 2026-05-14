<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLDivElement> & {
		title?: string;
		description?: string;
		context?: Snippet;
		secondary?: Snippet;
		primary?: Snippet;
	};

	let { title, description, context, secondary, primary, class: className, ...restProps }: Props = $props();
</script>

<div
	data-slot="sticky-action-bar"
	class={cn(
		'sticky bottom-0 z-10 flex flex-col gap-3 border-t bg-background p-4 md:flex-row md:items-center md:justify-between',
		className
	)}
	{...restProps}
>
	<div class="grid min-w-0 gap-1">
		{#if context}
			{@render context()}
		{:else}
			{#if title}
				<strong class="text-sm">{title}</strong>
			{/if}
			{#if description}
				<span class="text-sm text-muted-foreground">{description}</span>
			{/if}
		{/if}
	</div>
	{#if secondary || primary}
		<div class="flex flex-wrap gap-2 md:justify-end">
			{@render secondary?.()}
			{@render primary?.()}
		</div>
	{/if}
</div>
