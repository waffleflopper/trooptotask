<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLElement> & {
		title?: string;
		description?: string;
		children?: Snippet;
		dateRange?: Snippet;
		actions?: Snippet;
	};

	let {
		title = 'Report configuration',
		description,
		children,
		dateRange,
		actions,
		class: className,
		...restProps
	}: Props = $props();
</script>

<section
	data-slot="report-workspace-filters"
	aria-label={title}
	class={cn('flex flex-col gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground', className)}
	{...restProps}
>
	{#if title || description}
		<div class="min-w-0 space-y-1">
			{#if title}
				<h3 class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
					{title}
				</h3>
			{/if}
			{#if description}
				<p class="text-sm text-muted-foreground">{description}</p>
			{/if}
		</div>
	{/if}

	{#if children || dateRange}
		<div class="grid min-w-0 gap-x-6 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
			{@render children?.()}
			{#if dateRange}
				<div class="min-w-0">
					{@render dateRange()}
				</div>
			{/if}
		</div>
	{/if}

	{#if actions}
		<div class="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
			{@render actions()}
		</div>
	{/if}
</section>
