<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import { Command as CommandPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils.js';
	import { getComboboxContext } from './context.js';

	type Props = CommandPrimitive.ItemProps & {
		value: string;
		label?: string;
		description?: string;
		searchValue?: string;
		children?: Snippet;
	};

	let {
		class: className,
		value,
		label,
		description,
		searchValue,
		children,
		disabled: disabledProp,
		onSelect,
		...restProps
	}: Props = $props();
	const context = getComboboxContext();
	const option = $derived(context.getOption(value));
	const displayLabel = $derived(label ?? option?.label ?? value);
	const displayDescription = $derived(description ?? option?.description);
	const commandValue = $derived(searchValue ?? `${displayLabel} ${displayDescription ?? ''}`.trim());
	const disabled = $derived(disabledProp ?? option?.disabled ?? false);
</script>

<CommandPrimitive.Item
	value={commandValue}
	data-slot="combobox-item"
	data-checked={context.isSelected(value)}
	{disabled}
	class={cn(
		'data-selected:bg-muted data-selected:text-foreground relative grid min-h-8 cursor-default grid-cols-[1rem_1fr] items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
		className
	)}
	onSelect={() => {
		onSelect?.();
		context.toggleValue(value);
	}}
	{...restProps}
>
	<CheckIcon class={cn('size-4', !context.isSelected(value) && 'text-transparent')} />
	<span class="col-start-2 min-w-0 truncate">
		{#if children}
			{@render children()}
		{:else}
			<span class="grid min-w-0 gap-0.5">
				<span class="truncate">{displayLabel}</span>
				{#if displayDescription}
					<span class="truncate text-xs text-muted-foreground">{displayDescription}</span>
				{/if}
			</span>
		{/if}
	</span>
</CommandPrimitive.Item>
