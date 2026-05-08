<script lang="ts">
	import { Accordion as AccordionPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils.js';

	let {
		children,
		...restProps
	}: {
		children?: Snippet;
	} = $props();
</script>

<AccordionPrimitive.Content
	data-slot="onboarding-packet-content"
	class={cn('border-t border-border bg-muted/25')}
	{...restProps}
>
	<div class="flex flex-col gap-3 p-4 max-sm:p-3">
		{@render children?.()}
	</div>
</AccordionPrimitive.Content>
