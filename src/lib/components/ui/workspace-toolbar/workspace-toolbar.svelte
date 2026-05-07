<script lang="ts">
	import { setContext } from 'svelte';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { workspaceToolbarLayoutContextKey, type WorkspaceToolbarLayoutContext } from './workspace-toolbar-layout.js';

	type Props = HTMLAttributes<HTMLDivElement> & {
		ariaLabel: string;
		children?: Snippet;
	};

	let { ariaLabel, children, class: className, ...restProps }: Props = $props();
	const layout: WorkspaceToolbarLayoutContext = $state({ width: 0 });

	setContext(workspaceToolbarLayoutContextKey, layout);
</script>

<div
	bind:clientWidth={layout.width}
	role="toolbar"
	aria-label={ariaLabel}
	data-slot="workspace-toolbar"
	class={cn(
		'flex h-12 w-full shrink-0 flex-nowrap items-center gap-1.5 overflow-x-auto rounded-lg border border-border bg-card p-2 text-card-foreground shadow-xs',
		'[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
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

		:global([data-slot='workspace-toolbar'] [data-workspace-toolbar-action-label]) {
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
