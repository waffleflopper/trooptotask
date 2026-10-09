<script lang="ts">
	import * as Accordion from '$lib/components/ui/accordion';
	import type { Snippet } from 'svelte';

	let {
		children,
		...restProps
	}: {
		children?: Snippet;
	} = $props();
</script>

<Accordion.Trigger
	level={2}
	data-slot="onboarding-packet-trigger"
	class="items-center gap-2 rounded-none border-0 bg-card px-4 py-3 text-card-foreground hover:bg-muted/40 hover:no-underline data-[state=open]:bg-muted/25 max-sm:px-3"
	{...restProps}
>
	{@render children?.()}
</Accordion.Trigger>
