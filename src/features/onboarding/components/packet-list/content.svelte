<script lang="ts">
	import * as Accordion from '$lib/components/ui/accordion';
	import type { Snippet } from 'svelte';

	let {
		children
	}: {
		children?: Snippet;
	} = $props();
</script>

<Accordion.Content
	data-slot="onboarding-packet-content"
	class="flex flex-col gap-6 border-l-3 border-l-foreground bg-muted/40 p-4 md:flex-row md:gap-10 md:py-5 md:pr-5 md:pl-8"
>
	{@render children?.()}
</Accordion.Content>
