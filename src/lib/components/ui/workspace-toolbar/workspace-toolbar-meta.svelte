<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLDivElement> & {
		children?: Snippet;
		tone?: 'neutral' | 'warning' | 'success';
	};

	let { children, tone = 'neutral', class: className, ...restProps }: Props = $props();
</script>

<div
	data-slot="workspace-toolbar-meta"
	class={cn(
		'inline-flex h-8 shrink-0 items-center rounded-lg border px-2.5 text-xs font-medium',
		tone === 'neutral' && 'border-border bg-muted text-muted-foreground',
		tone === 'warning' && 'border-amber-600/25 bg-amber-600/10 text-amber-900 dark:text-amber-200',
		tone === 'success' && 'border-green-700/25 bg-green-700/10 text-green-900 dark:text-green-200',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
