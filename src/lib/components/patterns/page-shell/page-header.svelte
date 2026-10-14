<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLElement> & {
		title: string;
		subtitle?: string | Snippet;
		back?: Snippet;
		meta?: Snippet;
	};

	let { title, subtitle, back, meta, class: className, ...restProps }: Props = $props();
</script>

<header data-slot="page-header" class={cn('grid min-w-0 gap-2', className)} {...restProps}>
	<div class="flex min-w-0 flex-wrap items-center gap-2">
		{#if back}
			{@render back()}
		{/if}
		<h1 class="min-w-0 font-heading text-2xl font-semibold tracking-tight">{title}</h1>
		{#if meta}
			{@render meta()}
		{/if}
	</div>
	{#if subtitle}
		<p class="max-w-3xl text-sm text-muted-foreground">
			{#if typeof subtitle === 'string'}{subtitle}{:else}{@render subtitle()}{/if}
		</p>
	{/if}
</header>
