<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button, type ButtonProps } from '$lib/components/ui/button';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		selected = false,
		children,
		class: className,
		...restProps
	}: Omit<ButtonProps, 'href' | 'variant' | 'size' | 'children'> & {
		selected?: boolean;
		children?: Snippet;
	} = $props();
</script>

<Button
	bind:ref
	variant="outline"
	size="none"
	data-slot="kanban-board-card"
	aria-pressed={selected}
	class={cn(
		'h-auto w-full flex-col items-stretch justify-start p-3 text-left font-normal whitespace-normal aria-pressed:border-primary aria-pressed:ring-1 aria-pressed:ring-primary/20',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</Button>
