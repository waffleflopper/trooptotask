<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils.js';

	type Props = {
		selectedCount: number;
		totalCount: number;
		children?: Snippet;
		class?: string;
	};

	let { selectedCount, totalCount, children, class: className }: Props = $props();
</script>

<div
	data-slot="data-table-bulk-actions"
	class={cn(
		'flex min-h-11 items-center justify-between gap-3 border-b border-border bg-muted/35 px-3 py-2 text-sm',
		className
	)}
>
	<p class="text-muted-foreground">{selectedCount} of {totalCount} selected</p>
	{#if children}
		<div class="flex items-center gap-2">
			{@render children()}
		</div>
	{/if}
</div>
