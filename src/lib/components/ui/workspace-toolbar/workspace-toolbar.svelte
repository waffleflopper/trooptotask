<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLDivElement> & {
		ariaLabel: string;
		children?: Snippet;
	};

	let { ariaLabel, children, class: className, ...restProps }: Props = $props();
</script>

<div
	role="toolbar"
	aria-label={ariaLabel}
	data-slot="workspace-toolbar"
	class={cn(
		'flex h-12 w-full flex-nowrap items-center gap-1.5 overflow-x-auto rounded-lg border border-border bg-card p-2 text-card-foreground shadow-xs',
		'[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
		'[&_[data-slot=button]]:shrink-0 [&_[data-slot=input-group]]:min-w-0',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
