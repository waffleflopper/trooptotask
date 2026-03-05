<script lang="ts">
	import { helpStore } from '$lib/stores/help.svelte';

	let { topic }: { topic: string } = $props();
</script>

<button
	class="help-btn"
	onclick={() => helpStore.open(topic)}
	aria-label="Help"
	title="Help"
>
	?
</button>

<style>
	.help-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: 1px solid var(--color-border);
		background: transparent;
		color: var(--color-text-muted);
		font-size: 11px;
		font-weight: 600;
		cursor: pointer;
		vertical-align: middle;
		margin-left: var(--spacing-xs);
		padding: 0;
		line-height: 1;
		transition: all 0.15s;
		flex-shrink: 0;
	}

	.help-btn:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
		background: rgba(63, 81, 181, 0.08);
	}
</style>
