<script lang="ts">
	import * as Accordion from '$lib/components/ui/accordion';
	import type { Snippet } from 'svelte';

	let {
		children
	}: {
		children?: Snippet;
	} = $props();
</script>

<Accordion.Trigger
	level={3}
	data-slot="onboarding-packet-trigger"
	class="items-center gap-4 rounded-none border-0 border-l-3 border-l-transparent bg-card px-3.5 py-3 text-base font-normal hover:bg-muted/60 hover:no-underline aria-expanded:border-l-foreground aria-expanded:bg-muted"
>
	{@render children?.()}
</Accordion.Trigger>
