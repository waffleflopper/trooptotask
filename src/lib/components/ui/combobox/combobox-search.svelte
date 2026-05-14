<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import * as Command from '$lib/components/ui/command/index.js';
	import { getComboboxContext } from './context.js';

	type Props = Omit<ComponentProps<typeof Command.Input>, 'value'>;

	let { placeholder = 'Search...', oninput, ...restProps }: Props = $props();
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
	{...restProps}
/>
