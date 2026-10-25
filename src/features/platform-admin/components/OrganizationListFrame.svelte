<script lang="ts" module>
	const columns = 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_4.5rem_5.5rem_7rem_7rem_6.5rem]';

	export const rowClass = `grid gap-x-4 gap-y-2 border-b border-border px-3 py-3 lg:items-center ${columns}`;
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';

	let { children }: { children: Snippet } = $props();
</script>

<div>
	<div
		class="hidden gap-x-4 border-t border-b border-foreground px-3 py-2 font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase lg:grid {columns}"
		aria-hidden="true"
	>
		<span>Organization</span>
		<span>Owner</span>
		<span>Members</span>
		<span>Personnel</span>
		<span class="inline-flex items-center gap-1">Last active <ArrowDown class="size-3" /></span>
		<span>Created</span>
		<span>Status</span>
	</div>
	<ul class="max-lg:border-t max-lg:border-foreground">
		{@render children()}
	</ul>
</div>
