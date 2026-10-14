<script lang="ts">
	import * as Accordion from '$lib/components/ui/accordion';
	import type { Snippet } from 'svelte';

	let {
		value = $bindable(''),
		ariaLabel = 'Finished packets',
		children
	}: {
		value?: string;
		ariaLabel?: string;
		children?: Snippet;
	} = $props();
</script>

<Accordion.Root
	bind:value
	type="single"
	aria-label={ariaLabel}
	data-slot="onboarding-packet-list"
	class="overflow-hidden rounded-lg border border-border bg-card text-card-foreground"
>
	{@render children?.()}
</Accordion.Root>
