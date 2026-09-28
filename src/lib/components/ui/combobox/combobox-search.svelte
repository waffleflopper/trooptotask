<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import * as Command from '$lib/components/ui/command/index.js';
	import { getComboboxContext } from './context.js';

	type Props = Omit<ComponentProps<typeof Command.Input>, 'value'>;

	let { placeholder = 'Search...', oninput, onkeydown, ...restProps }: Props = $props();
	const context = getComboboxContext();
</script>

<Command.Input
	value={context.search}
	{placeholder}
	disabled={context.disabled}
	oninput={(event) => {
		oninput?.(event);
		if (event.defaultPrevented) return;
		context.setSearch(event.currentTarget.value);
	}}
	onkeydown={(event) => {
		onkeydown?.(event);
		if (event.defaultPrevented || event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
		const options = context.content?.querySelectorAll<HTMLElement>(
			'[data-slot="combobox-item"]:not([aria-disabled="true"]):not([hidden])'
		);
		if (options?.length !== 1) return;
		event.preventDefault();
		event.stopPropagation();
		options[0].click();
	}}
	{...restProps}
/>
