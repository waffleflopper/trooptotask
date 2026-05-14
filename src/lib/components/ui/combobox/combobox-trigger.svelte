<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import XIcon from '@lucide/svelte/icons/x';
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import type { ClassValue } from 'clsx';
	import { cn } from '$lib/utils.js';
	import { getComboboxContext } from './context.js';

	let {
		ref = $bindable(null),
		class: className,
		placeholder = 'Select...',
		clearable = false,
		children,
		onclick,
		onkeydown,
		...restProps
	}: Omit<HTMLButtonAttributes, 'class'> & {
		ref?: HTMLDivElement | null;
		class?: ClassValue;
		placeholder?: string;
		clearable?: boolean;
		children?: Snippet<[string[]]>;
	} = $props();

	const context = getComboboxContext();
	const selectedValues = $derived(context.getSelectedValues());
	const selectedLabels = $derived(context.getSelectedLabels());
	const displayValue = $derived(selectedLabels.length > 0 ? selectedLabels.join(', ') : placeholder);

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
	data-slot="combobox-trigger"
	data-placeholder={selectedValues.length === 0 ? '' : undefined}
	class={cn(
		'border-input data-placeholder:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50 focus-within:border-ring focus-within:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 gap-1.5 rounded-lg border bg-transparent text-sm transition-colors select-none focus-within:ring-3 aria-invalid:ring-3 h-8 flex w-full items-center justify-between whitespace-nowrap outline-none has-disabled:cursor-not-allowed has-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
		className
	)}
>
	<button
		type="button"
		class="flex h-full min-w-0 flex-1 items-center justify-between gap-1.5 py-2 pr-2 pl-2.5 text-left outline-none disabled:cursor-not-allowed"
		aria-haspopup="listbox"
		aria-expanded={context.open ? 'true' : 'false'}
		disabled={context.disabled}
		onclick={(event) => {
			onclick?.(event);
			if (event.defaultPrevented || context.disabled) return;
			context.setOpen(!context.open);
		}}
		onkeydown={(event) => {
			onkeydown?.(event);
			if (event.defaultPrevented || context.disabled) return;

			if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				context.setOpen(true);
			}

			if ((event.key === 'Backspace' || event.key === 'Delete') && clearable && !context.multiple) {
				context.removeValue(selectedValues[0] ?? '');
			}
		}}
		{...restProps}
	>
		<span data-slot="combobox-trigger-value" class="min-w-0 truncate">
			{#if children}
				{@render children(selectedValues)}
			{:else}
				{displayValue}
			{/if}
		</span>
		<ChevronDownIcon class="text-muted-foreground size-4" aria-hidden="true" />
	</button>
	{#if clearable && selectedValues.length > 0 && !context.disabled}
		<button
			type="button"
			data-slot="combobox-clear"
			aria-label="Clear selection"
			class="text-muted-foreground hover:text-foreground mr-1 inline-flex size-6 items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
			onclick={(event) => {
				event.stopPropagation();
				context.removeValue(selectedValues[0] ?? '');
			}}
		>
			<XIcon class="size-3.5" />
		</button>
	{/if}
</div>
