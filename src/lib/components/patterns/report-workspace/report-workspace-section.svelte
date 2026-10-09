<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLElement> & {
		title: string;
		description?: string;
		meta?: string;
		/** `briefing` drops the card for an open section under a heavy rule with a small-caps eyebrow. */
		variant?: 'card' | 'briefing';
		eyebrow?: string;
		children?: Snippet;
		actions?: Snippet;
		summary?: Snippet;
	};

	let {
		title,
		description,
		meta,
		variant = 'card',
		eyebrow,
		children,
		actions,
		summary,
		class: className,
		...restProps
	}: Props = $props();
	const uid = $props.id();
</script>

{#if variant === 'briefing'}
	<section
		data-slot="report-workspace-section"
		data-variant="briefing"
		aria-labelledby={`${uid}-title`}
		class={cn('min-w-0 border-t-2 border-foreground pt-7 text-foreground', className)}
		{...restProps}
	>
		<div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div class="min-w-0 space-y-1.5">
				{#if eyebrow}
					<p class="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{eyebrow}</p>
				{/if}
				<h2 id={`${uid}-title`} class="font-heading text-[22px] leading-[26px] font-semibold [overflow-wrap:anywhere]">
					{title}
				</h2>
				{#if description}
					<p class="max-w-[560px] text-sm text-muted-foreground [overflow-wrap:anywhere]">{description}</p>
				{/if}
			</div>
			{#if actions}
				<div class="flex shrink-0 flex-col items-start gap-3 sm:items-end">
					{@render actions()}
				</div>
			{/if}
		</div>
		{@render children?.()}
	</section>
{:else}
	<section
		data-slot="report-workspace-section"
		aria-labelledby={`${uid}-title`}
		class={cn('min-w-0 rounded-lg border border-border bg-card text-card-foreground', className)}
		{...restProps}
	>
		<div class="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-start sm:justify-between">
			<div class="min-w-0 space-y-1">
				<h3 id={`${uid}-title`} class="text-base font-semibold text-foreground [overflow-wrap:anywhere]">{title}</h3>
				{#if description}
					<p class="text-sm text-muted-foreground [overflow-wrap:anywhere]">{description}</p>
				{/if}
				{#if meta}
					<p
						class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground [overflow-wrap:anywhere]"
					>
						{meta}
					</p>
				{/if}
			</div>
			{#if actions}
				<div class="flex shrink-0 flex-wrap items-center gap-2">
					{@render actions()}
				</div>
			{/if}
		</div>
		{#if summary}
			<div class="min-w-0 border-b border-border bg-muted/35">
				{@render summary()}
			</div>
		{/if}
		<div class="min-w-0 p-3">
			{@render children?.()}
		</div>
	</section>
{/if}
