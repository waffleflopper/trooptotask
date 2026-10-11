<script lang="ts">
	import { setContext } from 'svelte';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { workspaceToolbarLayoutContextKey, type WorkspaceToolbarLayoutContext } from './workspace-toolbar-layout.js';

	type Props = HTMLAttributes<HTMLDivElement> & {
		ariaLabel: string;
		/** Wrap controls onto further rows instead of scrolling a single row sideways. */
		wrap?: boolean;
		children?: Snippet;
	};

	let { ariaLabel, wrap = false, children, class: className, ...restProps }: Props = $props();
	const layout: WorkspaceToolbarLayoutContext = $state({ width: 0 });

	setContext(workspaceToolbarLayoutContextKey, layout);
</script>

<div
	bind:clientWidth={layout.width}
	role="toolbar"
	aria-label={ariaLabel}
	data-slot="workspace-toolbar"
	class={cn(
		'flex w-full shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card p-2 text-card-foreground shadow-xs',
		wrap
			? 'min-h-12 flex-wrap [&_[data-slot=workspace-toolbar-group]]:max-w-full [&_[data-slot=workspace-toolbar-group]]:flex-wrap'
			: 'h-12 flex-nowrap overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
		'[&_[data-slot=button]]:shrink-0 [&_[data-slot=input-group]]:min-w-0',
		// Important keeps these container rules above consumer overrides, as the former unlayered stylesheet did.
		'@container',
		'toolbar-compact:[&_[data-slot=select-trigger]]:max-w-[8.5rem]! toolbar-compact:[&_[data-slot=select-trigger]]:min-w-0! toolbar-compact:[&_[data-slot=input-group]]:w-40!',
		'toolbar-narrow:gap-1! toolbar-narrow:px-1.5! toolbar-narrow:[&_[data-workspace-toolbar-action-label]:not(:only-child)]:hidden! toolbar-narrow:[&_[data-slot=select-trigger]]:max-w-28! toolbar-narrow:[&_[data-slot=input-group]]:w-32!',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
