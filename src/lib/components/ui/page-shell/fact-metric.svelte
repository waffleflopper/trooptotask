<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type MetricTone = 'default' | 'warning' | 'success' | 'danger';

	type Props = HTMLAttributes<HTMLDivElement> & {
		label: string;
		value: string | number;
		detail?: string;
		tone?: MetricTone;
		children?: Snippet;
	};

	let { label, value, detail, tone = 'default', children, class: className, ...restProps }: Props = $props();

	const valueToneClass: Record<MetricTone, string> = {
		default: 'text-foreground',
		warning: 'text-warning-foreground',
		success: 'text-success-foreground',
		danger: 'text-destructive'
	};
</script>

<div data-slot="fact-metric" class={cn('grid gap-1 rounded-lg border p-3', className)} {...restProps}>
	<span class="text-xs text-muted-foreground">{label}</span>
	<strong class="text-xl font-semibold {valueToneClass[tone]}">{value}</strong>
	{#if children}
		<div class="text-xs text-muted-foreground">
			{@render children()}
		</div>
	{:else if detail}
		<span class="text-xs text-muted-foreground">{detail}</span>
	{/if}
</div>
