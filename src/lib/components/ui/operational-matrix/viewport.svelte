<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLDivElement> & {
		ariaLabel: string;
		maxHeight?: string;
		virtualized?: boolean;
		children?: Snippet;
	};

	let { ariaLabel, maxHeight, virtualized = false, children, class: className, ...restProps }: Props = $props();
</script>

<div
	role="region"
	aria-label={ariaLabel}
	data-slot="operational-matrix-viewport"
	data-matrix-viewport
	data-virtualized={virtualized || undefined}
	class={cn('w-full min-w-0 overflow-auto', className)}
	style:max-height={maxHeight}
	{...restProps}
>
	{@render children?.()}
</div>
