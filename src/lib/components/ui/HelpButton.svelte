<script lang="ts">
	import { helpStore } from '$lib/stores/help.svelte';

	let { topic }: { topic: string } = $props();
</script>

<button class="help-btn" onclick={() => helpStore.open(topic)} aria-label="Help" title="Help"> ? </button>

<style>
	.help-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: 1px solid var(--border-default);
		background: transparent;
		color: var(--text-tertiary);
		font-size: 11px;
		font-weight: 600;
		cursor: pointer;
		vertical-align: middle;
		margin-left: var(--sp-1);
		padding: 0;
		line-height: 1;
		transition: all 0.15s;
		flex-shrink: 0;
	}

	.help-btn:hover {
		border-color: var(--amber);
		color: var(--amber);
		background: rgba(63, 81, 181, 0.08);
	}
</style>
