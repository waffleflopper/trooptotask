<script lang="ts">
	import { Accordion as AccordionPrimitive } from 'bits-ui';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils.js';

	let {
		children,
		...restProps
	}: {
		children?: Snippet;
	} = $props();
</script>

<AccordionPrimitive.Header data-slot="onboarding-packet-header" class={cn('m-0')}>
	<AccordionPrimitive.Trigger
		data-slot="onboarding-packet-trigger"
		class={cn(
			'group flex w-full items-center gap-2 bg-card px-4 py-3 text-left text-card-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=open]:bg-muted/25 max-sm:px-3'
		)}
		{...restProps}
	>
		<ChevronRight
			class="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90"
			aria-hidden="true"
		/>
		{@render children?.()}
	</AccordionPrimitive.Trigger>
</AccordionPrimitive.Header>
