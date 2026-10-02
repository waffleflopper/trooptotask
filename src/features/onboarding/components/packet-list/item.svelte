<script lang="ts">
	import { Accordion as AccordionPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils.js';

	let {
		value,
		children,
		...restProps
	}: {
		value: string;
		children?: Snippet;
	} = $props();
</script>

<AccordionPrimitive.Item
	{value}
	data-slot="onboarding-packet-item"
	class={cn(
		'overflow-hidden rounded-lg border border-border bg-card text-card-foreground transition-colors hover:shadow-sm data-[state=open]:border-primary'
	)}
	{...restProps}
>
	{@render children?.()}
</AccordionPrimitive.Item>
