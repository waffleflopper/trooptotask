<script lang="ts" module>
	const columns = 'lg:grid-cols-[minmax(0,2.4fr)_5rem_6rem_8rem_8rem_6rem]';

	export const rowClass = `grid gap-x-4 gap-y-2 px-4 py-3 lg:items-center ${columns}`;
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="overflow-hidden rounded-lg border bg-card">
	<div
		class="hidden gap-x-4 border-b bg-muted/60 px-4 py-2 text-xs font-medium text-muted-foreground lg:grid {columns}"
		aria-hidden="true"
	>
		<span>Organization</span>
		<span>Members</span>
		<span>Personnel</span>
		<span>Last active</span>
		<span>Created</span>
		<span>Status</span>
	</div>
	<ul class="divide-y">
		{@render children()}
	</ul>
</div>
