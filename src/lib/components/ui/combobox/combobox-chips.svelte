<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { getComboboxContext } from './context.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		onclick,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>, HTMLDivElement> = $props();

	const context = getComboboxContext();

	function handleClick(event: MouseEvent & { currentTarget: EventTarget & HTMLDivElement }) {
		onclick?.(event);
		if (event.defaultPrevented || context.disabled) return;

		const target = event.target as HTMLElement;
		if (target.closest('[data-slot="combobox-chip"]')) return;

		context.setOpen(true);
		window.setTimeout(() => {
			ref?.querySelector('input')?.focus();
		});
	}

	const anchorAttachment: Attachment<HTMLDivElement> = (node) => {
		ref = node;
		context.setAnchor(node);

		return () => {
			context.setAnchor(null);
			ref = null;
		};
	};
</script>

<div
	{@attach anchorAttachment}
	data-slot="combobox-chips"
	aria-disabled={context.disabled}
	class={cn(
		'border-input bg-background dark:bg-input/30 focus-within:border-ring focus-within:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 relative inline-flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border p-1 text-start text-base shadow-xs transition-colors focus-within:ring-3 aria-invalid:ring-3 md:text-sm has-disabled:pointer-events-none has-disabled:cursor-not-allowed has-disabled:opacity-50',
		className
	)}
	onclick={handleClick}
	{...restProps}
>
	{@render children?.()}
</div>
