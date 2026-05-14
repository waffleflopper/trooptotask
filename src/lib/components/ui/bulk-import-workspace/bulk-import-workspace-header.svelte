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
		step?: string;
		meta?: MetaItem[];
		children?: Snippet;
	};

	let { title, description, step, meta = [], children, class: className, ...restProps }: Props = $props();
</script>

<header
	data-slot="bulk-import-workspace-header"
	class={cn('flex min-w-0 flex-col gap-2 border-b border-border pb-4', className)}
	{...restProps}
>
	{#if step}
		<p class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{step}</p>
	{/if}
	<div class="space-y-1">
		<h2 class="text-xl font-semibold tracking-normal text-foreground">{title}</h2>
		{#if description}
			<p class="max-w-[72ch] text-sm text-muted-foreground">{description}</p>
		{/if}
	</div>
	{#if meta.length > 0}
		<dl class="flex flex-wrap gap-2">
			{#each meta as item (`${item.label}-${item.value}`)}
				<div class="rounded-md border border-border bg-muted/30 px-2 py-1 text-xs">
					<dt class="sr-only">{item.label}</dt>
					<dd>{item.value}</dd>
				</div>
			{/each}
		</dl>
	{/if}
	{@render children?.()}
</header>
