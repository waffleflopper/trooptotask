<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
		/** A snippet renders inside the h1, for a title that is itself a control. */
		title: string | Snippet;
		eyebrow?: string;
		subtitle?: string | Snippet;
		back?: Snippet;
		meta?: Snippet;
		aside?: Snippet;
	};

	let { title, eyebrow, subtitle, back, meta, aside, class: className, ...restProps }: Props = $props();
</script>

<header data-slot="page-header" class={cn('grid min-w-0 gap-2', className)} {...restProps}>
	{#if eyebrow}
		<p class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{eyebrow}</p>
	{/if}
	<div class="flex min-w-0 flex-wrap items-center gap-2">
		{#if back}
			{@render back()}
		{/if}
		<h1 class="min-w-0 font-heading text-2xl font-semibold tracking-tight">
			{#if typeof title === 'string'}{title}{:else}{@render title()}{/if}
		</h1>
		{#if meta}
			{@render meta()}
		{/if}
		{#if aside}
			<div class="ml-auto flex min-w-0 flex-wrap items-center gap-3">
				{@render aside()}
			</div>
		{/if}
	</div>
	{#if typeof subtitle === 'string'}
		<p data-slot="page-header-subtitle" class="max-w-3xl text-sm text-muted-foreground">{subtitle}</p>
	{:else if subtitle}
		<div data-slot="page-header-subtitle" class="max-w-3xl text-sm text-muted-foreground">
			{@render subtitle()}
		</div>
	{/if}
</header>
