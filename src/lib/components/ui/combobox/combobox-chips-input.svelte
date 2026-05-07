<script lang="ts">
	import { Command as CommandPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';
	import { getComboboxContext } from './context.js';

	type Props = Omit<CommandPrimitive.InputProps, 'value' | 'child' | 'children'>;

	let {
		ref = $bindable(null),
		class: className,
		placeholder,
		onfocus,
		oninput,
		onkeydown,
		...restProps
	}: Props = $props();

	const context = getComboboxContext();
</script>

<CommandPrimitive.Input
	bind:ref
	value={context.search}
	data-slot="combobox-chips-input"
	class={cn(
		'placeholder:text-muted-foreground min-h-6 min-w-20 flex-1 bg-transparent px-1 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	placeholder={context.getSelectedValues().length === 0 ? placeholder : ''}
	disabled={context.disabled}
	onfocus={(event) => {
		onfocus?.(event);
		context.setOpen(true);
	}}
	oninput={(event) => {
		oninput?.(event);
		context.setOpen(true);
		context.setSearch(event.currentTarget.value);
	}}
	onkeydown={(event) => {
		onkeydown?.(event);
		if (event.defaultPrevented) return;

		if (event.key === 'Escape') {
			context.setOpen(false);
			return;
		}

		if (event.key === 'Backspace') {
			context.clearLastValue();
		}
	}}
	{...restProps}
>
	{#snippet child({ props })}
		<input {...props} value={context.search} aria-expanded={context.open ? 'true' : 'false'} />
	{/snippet}
</CommandPrimitive.Input>
