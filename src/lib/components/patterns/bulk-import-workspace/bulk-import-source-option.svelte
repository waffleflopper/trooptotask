<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLButtonAttributes & {
		label: string;
		description?: string;
		selected?: boolean;
		children?: Snippet;
		onSelect?: () => void;
	};

	let { label, description, selected = false, children, onSelect, class: className, ...restProps }: Props = $props();
</script>

<button
	type="button"
	role="radio"
	aria-checked={selected}
	data-slot="bulk-import-source-option"
	data-selected={selected || undefined}
	class={cn(
		'flex min-h-24 flex-col items-start gap-2 rounded-lg border border-border bg-card p-3 text-left text-card-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
		'data-[selected=true]:border-primary data-[selected=true]:bg-primary/5',
		className
	)}
	onclick={onSelect}
	{...restProps}
>
	<span class="font-medium">{label}</span>
	{#if description}
		<span class="text-sm text-muted-foreground">{description}</span>
	{/if}
	{@render children?.()}
</button>
