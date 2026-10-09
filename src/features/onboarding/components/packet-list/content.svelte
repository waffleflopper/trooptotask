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

<Accordion.Content
	data-slot="onboarding-packet-content"
	class="flex flex-col gap-3 border-t border-border bg-muted/25 p-4 max-sm:p-3"
	{...restProps}
>
	{@render children?.()}
</Accordion.Content>
