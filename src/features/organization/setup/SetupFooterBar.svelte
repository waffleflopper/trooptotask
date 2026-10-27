<script lang="ts">
	import type { Snippet } from 'svelte';

	let { error, children }: { error: string | null; children: Snippet } = $props();
</script>

<!-- The rule and fill run past the column to the page edges, under the rail too. -->
<div
	class="sticky bottom-0 isolate z-10 mt-auto grid gap-2 py-3.5 before:absolute before:inset-y-0 before:-inset-x-[100vmax] before:-z-10 before:border-t before:border-border before:bg-background"
>
	{#if error}
		<p role="alert" class="text-sm leading-5 text-destructive-text">Couldn't save. {error}</p>
	{/if}
	<div class="flex items-center gap-3">
		{@render children()}
	</div>
</div>
