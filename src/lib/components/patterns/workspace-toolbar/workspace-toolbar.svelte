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
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>

<style>
	:global([data-slot='workspace-toolbar']) {
		container-type: inline-size;
	}

	@container (max-width: 47.5rem) {
		:global([data-slot='workspace-toolbar'] [data-slot='select-trigger']) {
			max-width: 8.5rem;
			min-width: 0;
		}

		:global([data-slot='workspace-toolbar'] [data-slot='input-group']) {
			width: 10rem;
		}
	}

	@container (max-width: 35rem) {
		:global([data-slot='workspace-toolbar']) {
			gap: 0.25rem;
			padding-inline: 0.375rem;
		}

		:global([data-slot='workspace-toolbar'] [data-workspace-toolbar-action-label]:not(:only-child)) {
			display: none;
		}

		:global([data-slot='workspace-toolbar'] [data-slot='select-trigger']) {
			max-width: 7rem;
		}

		:global([data-slot='workspace-toolbar'] [data-slot='input-group']) {
			width: 8rem;
		}
	}
</style>
