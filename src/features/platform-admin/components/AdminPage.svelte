<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="grid min-w-0 gap-6 px-4 pt-5 pb-10 sm:px-10 sm:pt-9">
	{@render children()}
</div>
