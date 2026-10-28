<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
		/** A snippet renders inside the h1, for a title that is itself a control. */
		title: string | Snippet;
		eyebrow?: string;
		/** Muted, mono and not uppercased, in parentheses after the title. It wraps to the next line as a unit. */
		titleNote?: string;
		/**
		 * `display` sets the title large, condensed and uppercase, for the record a page is about. `headline` sets it
		 * larger than the default in mixed case, for a workspace whose own name or record leads the page.
		 */
		variant?: 'default' | 'headline' | 'display';
		subtitle?: string | Snippet;
		back?: Snippet;
		meta?: Snippet;
		aside?: Snippet;
	};

	let {
		title,
		titleNote,
		eyebrow,
		variant = 'default',
		subtitle,
		back,
		meta,
		aside,
		class: className,
		...restProps
	}: Props = $props();
</script>

<header data-slot="page-header" class={cn('grid min-w-0 gap-2', className)} {...restProps}>
	{#if eyebrow}
		<p class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{eyebrow}</p>
	{/if}
	<div class="flex min-w-0 flex-wrap items-center gap-2">
		{#if back}
			{@render back()}
		{/if}
		<h1
			class={cn(
				'min-w-0 font-heading font-semibold',
				variant === 'display'
					? 'text-4xl leading-none tracking-[-0.01em] wrap-anywhere uppercase sm:text-5xl'
					: variant === 'headline'
						? 'text-[32px] leading-9 font-bold wrap-anywhere'
						: 'text-2xl tracking-tight'
			)}
		>
			{#if typeof title === 'string'}{title}{:else}{@render title()}{/if}
			{#if titleNote}
				<span
					class="font-mono text-base font-normal tracking-normal whitespace-nowrap text-muted-foreground normal-case"
					>({titleNote})</span
				>
			{/if}
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
