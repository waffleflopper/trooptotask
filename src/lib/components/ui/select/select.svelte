<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import { createSelectContext } from './context.svelte.js';

	let { open = $bindable(false), value = $bindable(), ...restProps }: SelectPrimitive.RootProps = $props();

	createSelectContext();
</script>

<SelectPrimitive.Root bind:open bind:value={value as never} {...restProps} />
