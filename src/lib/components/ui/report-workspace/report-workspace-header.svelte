<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type MetaItem = {
		label: string;
		value: string | number;
	};

	type Props = HTMLAttributes<HTMLElement> & {
		title: string;
		description?: string;
		meta?: MetaItem[];
		children?: Snippet;
		actions?: Snippet;
	};

	let { title, description, meta = [], children, actions, class: className, ...restProps }: Props = $props();
</script>

<header
	data-slot="report-workspace-header"
	class={cn(
		'flex min-w-0 flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-start md:justify-between',
		className
	)}
	{...restProps}
>
	<div class="min-w-0 space-y-2">
		<div class="space-y-1">
			<h2 class="text-xl font-semibold tracking-normal text-foreground">{title}</h2>
			{#if description}
				<p class="max-w-[72ch] text-sm text-muted-foreground">{description}</p>
			{/if}
		</div>

		{#if meta.length > 0}
			<dl class="flex flex-wrap gap-x-4 gap-y-1">
				{#each meta as item (`${item.label}-${item.value}`)}
					<div class="flex items-center gap-1.5 text-xs">
						<dt class="font-mono font-semibold uppercase tracking-[0.08em] text-muted-foreground">{item.label}</dt>
						<dd class="text-foreground">{item.value}</dd>
					</div>
				{/each}
			</dl>
		{/if}

		{@render children?.()}
	</div>

	{#if actions}
		<div class="flex shrink-0 items-center gap-2 md:justify-end">
			{@render actions()}
		</div>
	{/if}
</header>
