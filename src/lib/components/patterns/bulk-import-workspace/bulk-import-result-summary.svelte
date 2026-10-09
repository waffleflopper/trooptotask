<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { cn } from '$lib/utils.js';

	type ResultItem = {
		label: string;
		value: string | number;
		tone?: 'success' | 'error' | 'warning' | 'neutral';
	};

	type Props = HTMLAttributes<HTMLDivElement> & {
		status: 'success' | 'partial' | 'failed';
		title?: string;
		description?: string;
		items?: ResultItem[];
		children?: Snippet;
		actions?: Snippet;
	};

	let { status, title, description, items = [], children, actions, class: className, ...restProps }: Props = $props();
	const resolvedTitle = $derived(
		title ??
			(status === 'success'
				? 'Import complete'
				: status === 'partial'
					? 'Import completed with issues'
					: 'Import failed')
	);
</script>

<Alert.Root variant={status === 'failed' ? 'destructive' : 'default'} class={cn('gap-3', className)} {...restProps}>
	<Alert.Title>{resolvedTitle}</Alert.Title>
	{#if description}
		<Alert.Description>{description}</Alert.Description>
	{/if}
	{#if items.length > 0}
		<dl class="grid gap-2 sm:grid-cols-4">
			{#each items as item (`${item.label}-${item.value}`)}
				<div class="rounded-md border border-border bg-muted/25 p-2">
					<dt class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
						{item.label}
					</dt>
					<dd class="text-lg font-semibold text-foreground">{item.value}</dd>
				</div>
			{/each}
		</dl>
	{/if}
	{@render children?.()}
	{#if actions}
		<div class="flex flex-wrap items-center gap-2">
			{@render actions()}
		</div>
	{/if}
</Alert.Root>
