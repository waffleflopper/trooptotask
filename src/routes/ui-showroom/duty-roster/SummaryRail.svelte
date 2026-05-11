<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Separator } from '$lib/components/ui/separator/index.js';

	let { title, children }: { title: string; children?: Snippet } = $props();
</script>

<aside class="grid content-start gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-label={title}>
	<h3 class="text-lg font-semibold">{title}</h3>
	<Separator />
	{@render children?.()}
</aside>
