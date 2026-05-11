<script lang="ts">
	import type { Snippet } from 'svelte';

	let { number, title, children }: { number: string; title: string; children?: Snippet } = $props();
</script>

<section class="grid gap-4 rounded-lg border p-4" aria-labelledby={`settings-section-${number}`}>
	<div class="flex items-center gap-3">
		<span class="flex size-7 items-center justify-center rounded-md border bg-muted text-xs font-semibold"
			>{number}</span
		>
		<h3 id={`settings-section-${number}`} class="text-base font-semibold">{title}</h3>
	</div>
	{@render children?.()}
</section>
