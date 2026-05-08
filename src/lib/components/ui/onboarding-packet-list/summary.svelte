<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		children,
		progress,
		status
	}: {
		children?: Snippet;
		progress?: Snippet;
		status?: Snippet;
	} = $props();
</script>

<div data-slot="onboarding-packet-summary" class="flex min-w-0 flex-1 items-center gap-3 max-md:flex-wrap">
	<div class="min-w-0 flex-1">
		{@render children?.()}
	</div>
	{#if progress}
		<div class="w-40 shrink-0 max-md:w-full">
			{@render progress()}
		</div>
	{/if}
	{#if status}
		<div class="shrink-0 max-md:ml-auto">
			{@render status()}
		</div>
	{/if}
</div>
