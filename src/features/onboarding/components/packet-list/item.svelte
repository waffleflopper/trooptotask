<script lang="ts">
	import * as Accordion from '$lib/components/ui/accordion';
	import type { Snippet } from 'svelte';

	let {
		value,
		children
	}: {
		value: string;
		children?: Snippet;
	} = $props();
</script>

<Accordion.Item {value} data-slot="onboarding-packet-item" class="border-b border-border last:border-b-0">
	{@render children?.()}
</Accordion.Item>
