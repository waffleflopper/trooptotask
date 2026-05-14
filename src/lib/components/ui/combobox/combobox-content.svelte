<script lang="ts">
	import type { ComponentProps, Snippet } from 'svelte';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { cn } from '$lib/utils.js';
	import { getComboboxContext } from './context.js';

	type Props = ComponentProps<typeof Popover.Content> & {
		children?: Snippet;
	};

	let {
		class: className,
		align = 'start',
		sideOffset = 4,
		children,
		onInteractOutside,
		onCloseAutoFocus,
		...restProps
	}: Props = $props();

	const context = getComboboxContext();

	function getContentRef() {
		return context.content;
	}

	function setContentRef(nextContent: HTMLElement | null) {
		context.setContent(nextContent);
	}
</script>

<Popover.Content
	bind:ref={getContentRef, setContentRef}
	customAnchor={context.anchor}
	{align}
	{sideOffset}
	onInteractOutside={(event) => {
		onInteractOutside?.(event);
		if (!event.defaultPrevented) {
			context.setOpen(false);
		}
	}}
	onCloseAutoFocus={(event) => {
		onCloseAutoFocus?.(event);
		if (!event.defaultPrevented) {
			event.preventDefault();
		}
	}}
	class={cn(
		'max-h-[min(var(--bits-popover-content-available-height),23rem)] w-(--bits-popover-anchor-width) overflow-hidden p-0',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</Popover.Content>
