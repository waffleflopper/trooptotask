<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';

	let { label, values }: { label: string; values: string[] } = $props();
</script>

<div class="grid gap-2">
	<span class="text-sm text-muted-foreground">{label}</span>
	<div class="flex flex-wrap gap-1">
		{#each values as value (value)}
			<Badge variant="outline">{value}</Badge>
		{/each}
	</div>
</div>
