<script lang="ts">
	import type { Snippet } from 'svelte';

	let { number, title, children }: { number: string; title: string; children?: Snippet } = $props();
</script>

<section
	class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground"
	aria-labelledby={`settings-section-${number}`}
>
	<div class="flex items-center gap-3">
		<span
			class="inline-flex h-6 min-w-8 items-center justify-center rounded-md border border-border bg-muted px-2 font-mono text-[0.7rem] font-medium text-muted-foreground"
			>{number}</span
		>
		<h3 id={`settings-section-${number}`} class="text-sm font-semibold text-foreground">{title}</h3>
	</div>
	{@render children?.()}
</section>
