<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLDivElement> & {
		label: string;
		activeCount?: number;
		children?: Snippet;
		zone?: 'controls' | 'actions' | 'meta';
	};

	let { label, activeCount = 0, children, zone = 'controls', class: className, ...restProps }: Props = $props();

	const ariaLabel = $derived(activeCount > 0 ? `${label}, ${activeCount} active` : label);
</script>

<div
	role="group"
	aria-label={ariaLabel}
	data-slot="workspace-toolbar-group"
	data-zone={zone}
	class={cn(
		'flex min-w-0 shrink-0 flex-nowrap items-center gap-1.5',
		zone === 'actions' && 'ml-auto justify-end',
		zone === 'meta' && 'text-muted-foreground',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
