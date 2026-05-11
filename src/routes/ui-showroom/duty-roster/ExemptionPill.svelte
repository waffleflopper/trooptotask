<script lang="ts">
	import { X } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	let { name, detail }: { name: string; detail: string } = $props();
</script>

<div class="flex items-center justify-between gap-3 rounded-lg border p-3">
	<span class="grid">
		<strong class="text-sm">{name}</strong>
		<span class="text-xs text-muted-foreground">{detail}</span>
	</span>
	<Button variant="ghost" size="icon-sm" aria-label={`Remove ${name}`}><X /></Button>
</div>
