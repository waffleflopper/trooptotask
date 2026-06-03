<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLDivElement> & {
		ariaLabel: string;
		maxHeight?: string;
		virtualized?: boolean;
		onViewportHeightChange?: (height: number) => void;
		children?: Snippet;
	};

	let {
		ariaLabel,
		maxHeight,
		virtualized = false,
		onViewportHeightChange,
		children,
		class: className,
		...restProps
	}: Props = $props();

	function handleClientHeightChange(height: number): void {
		onViewportHeightChange?.(height);
	}
</script>

<div
	role="region"
	aria-label={ariaLabel}
	data-slot="operational-matrix-viewport"
	data-matrix-viewport
	data-virtualized={virtualized || undefined}
	class={cn('w-full min-w-0 overflow-auto', className)}
	style:max-height={maxHeight}
	bind:clientHeight={null, handleClientHeightChange}
	{...restProps}
>
	{@render children?.()}
</div>
