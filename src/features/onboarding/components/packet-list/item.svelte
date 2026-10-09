<script lang="ts">
	import * as Accordion from '$lib/components/ui/accordion';
	import type { Snippet } from 'svelte';

	let {
		value,
		children,
		...restProps
	}: {
		value: string;
		children?: Snippet;
	} = $props();
</script>

<Accordion.Item
	{value}
	data-slot="onboarding-packet-item"
	class="overflow-hidden rounded-lg border border-border bg-card text-card-foreground transition-colors hover:shadow-sm data-[state=open]:border-primary"
	{...restProps}
>
	{@render children?.()}
</Accordion.Item>
