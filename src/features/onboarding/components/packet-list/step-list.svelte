<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		children,
		ariaLabel = 'Packet steps'
	}: {
		children?: Snippet;
		ariaLabel?: string;
	} = $props();
</script>

<div data-slot="onboarding-packet-step-list" class="flex flex-col gap-2" role="list" aria-label={ariaLabel}>
	{@render children?.()}
</div>
