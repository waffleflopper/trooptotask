<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { getComboboxContext } from './context.js';

	let {
		ref = $bindable(null),
		value,
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLSpanElement>, HTMLSpanElement> & {
		value?: string;
		children?: Snippet;
	} = $props();

	const context = getComboboxContext();
	const removeLabel = $derived(value ? (context.getOption(value)?.label ?? value) : '');

	const refAttachment: Attachment<HTMLSpanElement> = (node) => {
		ref = node;
		return () => {
			ref = null;
		};
	};
</script>

<span
	{@attach refAttachment}
	data-slot="combobox-chip"
	class={cn(
		'bg-muted text-muted-foreground inline-flex min-h-6 max-w-48 items-center gap-1 rounded-md ps-2 text-xs font-medium outline-none',
		className
	)}
	{...restProps}
>
	<span class="truncate">{@render children?.()}</span>
	{#if value}
		<button
			type="button"
			data-slot="combobox-chip-remove"
			class="hover:bg-accent-foreground/10 flex h-6 shrink-0 cursor-pointer items-center justify-center rounded-md px-1.5 text-inherit opacity-80 outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring [&_svg:not([class*='size-'])]:size-3.5"
			aria-label={`Remove ${removeLabel}`}
			disabled={context.disabled}
			onclick={(event) => {
				event.stopPropagation();
				context.removeValue(value);
			}}
		>
			<XIcon />
		</button>
	{/if}
</span>
