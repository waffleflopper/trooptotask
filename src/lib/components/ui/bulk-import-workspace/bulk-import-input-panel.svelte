<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLElement> & {
		title: string;
		description?: string;
		children?: Snippet;
		examples?: Snippet;
		actions?: Snippet;
	};

	let { title, description, children, examples, actions, class: className, ...restProps }: Props = $props();
</script>

<section
	data-slot="bulk-import-input-panel"
	aria-label={title}
	class={cn('rounded-lg border border-border bg-card p-3 text-card-foreground', className)}
	{...restProps}
>
	<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
		<div class="min-w-0 space-y-3">
			<div class="space-y-1">
				<h3 class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</h3>
				{#if description}
					<p class="text-sm text-muted-foreground">{description}</p>
				{/if}
			</div>
			{@render children?.()}
		</div>
		{#if examples || actions}
			<aside class="flex min-w-0 flex-col gap-2 lg:w-64">
				{@render examples?.()}
				{@render actions?.()}
			</aside>
		{/if}
	</div>
</section>
