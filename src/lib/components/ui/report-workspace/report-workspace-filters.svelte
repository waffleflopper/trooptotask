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
	class={cn('rounded-lg border border-border bg-card p-3 text-card-foreground', className)}
	{...restProps}
>
	<div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div class="min-w-0 space-y-1">
			<h3 class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</h3>
			{#if description}
				<p class="text-sm text-muted-foreground">{description}</p>
			{/if}
		</div>

		{#if dateRange}
			<div class="min-w-0">
				{@render dateRange()}
			</div>
		{/if}
	</div>

	<div class="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div class="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
			{@render children?.()}
		</div>

		{#if actions}
			<div class="flex shrink-0 flex-wrap items-center gap-2">
				{@render actions()}
			</div>
		{/if}
	</div>
</section>
