<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLElement> & {
		title: string;
		description?: string;
		meta?: string;
		children?: Snippet;
		actions?: Snippet;
	};

	let { title, description, meta, children, actions, class: className, ...restProps }: Props = $props();
	const uid = $props.id();
</script>

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
	<div class="min-w-0 p-3">
		{@render children?.()}
	</div>
</section>
