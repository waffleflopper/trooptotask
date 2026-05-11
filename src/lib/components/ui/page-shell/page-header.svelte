<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLElement> & {
		title: string;
		subtitle?: string;
		back?: Snippet;
		meta?: Snippet;
		actions?: Snippet;
		overflow?: Snippet;
	};

	let { title, subtitle, back, meta, actions, overflow, class: className, ...restProps }: Props = $props();
</script>

<header
	data-slot="page-header"
	class={cn('grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start', className)}
	{...restProps}
>
	<div class="grid min-w-0 gap-2">
		<div class="flex min-w-0 flex-wrap items-center gap-2">
			{#if back}
				{@render back()}
			{/if}
			<h1 class="min-w-0 text-2xl font-semibold tracking-tight">{title}</h1>
			{#if meta}
				{@render meta()}
			{/if}
		</div>
		{#if subtitle}
			<p class="max-w-3xl text-sm text-muted-foreground">{subtitle}</p>
		{/if}
	</div>

	{#if actions || overflow}
		<div class="flex flex-wrap gap-2 md:justify-end">
			{@render actions?.()}
			{@render overflow?.()}
		</div>
	{/if}
</header>
