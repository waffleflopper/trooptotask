<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		children,
		align = 'end'
	}: {
		children?: Snippet;
		align?: 'start' | 'end';
	} = $props();
</script>

<div
	data-slot="onboarding-packet-actions"
	class="flex flex-wrap gap-2 border-b border-border pb-3"
	class:justify-start={align === 'start'}
	class:justify-end={align === 'end'}
>
	{@render children?.()}
</div>
