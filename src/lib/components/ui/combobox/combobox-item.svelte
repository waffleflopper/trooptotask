<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import { Command as CommandPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils.js';
	import { getComboboxContext } from './context.js';

	type Props = CommandPrimitive.ItemProps & {
		value: string;
		children?: Snippet;
	};

	let { class: className, value, children, onSelect, ...restProps }: Props = $props();
	const context = getComboboxContext();
</script>

<CommandPrimitive.Item
	{value}
	data-slot="combobox-item"
	data-checked={context.isSelected(value)}
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
		{@render children?.()}
	</span>
</CommandPrimitive.Item>
