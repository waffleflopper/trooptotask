<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<p class="border-l-[3px] border-accent bg-muted px-4 py-3 text-sm leading-5">{@render children()}</p>
