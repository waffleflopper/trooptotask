<script lang="ts">
	import * as Accordion from '$lib/components/ui/accordion';
	import type { Snippet } from 'svelte';

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

<Accordion.Root
	bind:value
	type="single"
	onValueChange={handleValueChange}
	aria-label={ariaLabel}
	data-slot="onboarding-packet-list"
	class="gap-3"
	{...restProps}
>
	{@render children?.()}
</Accordion.Root>
