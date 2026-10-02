<script lang="ts">
	import { Accordion as AccordionPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils.js';

	let {
		value = $bindable(''),
		ariaLabel = 'Onboarding packets',
		children,
		onValueChange,
		...restProps
	}: {
		value?: string;
		ariaLabel?: string;
		children?: Snippet;
		onValueChange?: (value: string) => void;
	} = $props();

	function handleValueChange(nextValue: string) {
		value = nextValue;
		onValueChange?.(nextValue);
	}
</script>

<AccordionPrimitive.Root
	bind:value
	type="single"
	onValueChange={handleValueChange}
	aria-label={ariaLabel}
	data-slot="onboarding-packet-list"
	class={cn('flex flex-col gap-3')}
	{...restProps}
>
	{@render children?.()}
</AccordionPrimitive.Root>
