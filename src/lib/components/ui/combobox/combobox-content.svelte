<script lang="ts">
	import type { ComponentProps, Snippet } from 'svelte';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { cn } from '$lib/utils.js';
	import { getComboboxContext, getComboboxCommandContext } from './context.js';

	type Props = ComponentProps<typeof Popover.Content> & {
		children?: Snippet;
	};

	let {
		class: className,
		align = 'start',
		sideOffset = 4,
		children,
		onInteractOutside,
		onFocusOutside,
		trapFocus,
		onOpenAutoFocus,
		onCloseAutoFocus,
		...restProps
	}: Props = $props();

	const context = getComboboxContext();
	const command = getComboboxCommandContext();
	let commandElement = $state<HTMLDivElement | null>(null);

	function trigger() {
		return (
			context.anchor?.querySelector<HTMLInputElement>('input:not(:disabled)') ??
			context.anchor?.querySelector<HTMLButtonElement>('button:not(:disabled)')
		);
	}

	function dismissOutside(event: Event) {
		if (event.defaultPrevented || (event.target instanceof Node && context.anchor?.contains(event.target))) return;
		context.restoreFocus = false;
		context.setOpen(false);
	}

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
	trapFocus={trapFocus ?? false}
	onOpenAutoFocus={(event) => {
		if (context.open) context.restoreFocus = true;
		onOpenAutoFocus?.(event);
		if (event.defaultPrevented) return;
		event.preventDefault();
		if (!context.open) return;
		// Chip inputs live outside the popup and keep focus while selecting.
		const anchorControl = trigger();
		const target =
			anchorControl instanceof HTMLInputElement
				? anchorControl
				: (commandElement?.querySelector<HTMLInputElement>('input:not(:disabled)') ?? commandElement);
		target?.focus();
	}}
	onInteractOutside={(event) => {
		onInteractOutside?.(event);
		dismissOutside(event);
	}}
	onFocusOutside={(event) => {
		onFocusOutside?.(event);
		dismissOutside(event);
	}}
	onCloseAutoFocus={(event) => {
		onCloseAutoFocus?.(event);
		if (!event.defaultPrevented) {
			event.preventDefault();
			const anchorControl = trigger();
			if (context.restoreFocus && !(anchorControl instanceof HTMLInputElement)) anchorControl?.focus();
		}
	}}
	class={cn(
		'max-h-[min(var(--bits-popover-content-available-height),23rem)] w-(--bits-popover-anchor-width) overflow-hidden p-0',
		className
	)}
	{...restProps}
>
	<div {...command.props} bind:this={commandElement}>
		{@render children?.()}
	</div>
</Popover.Content>
