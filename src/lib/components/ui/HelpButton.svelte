<script lang="ts">
	import { helpStore } from '$lib/stores/help.svelte';

	let { topic }: { topic: string } = $props();
</script>

<button class="help-btn" type="button" onclick={() => helpStore.open(topic)} title="Open help for this page">
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
		<path
			d="M12 6.75c-1.8 0-3 1.01-3 2.52h1.73c0-.69.52-1.1 1.22-1.1.76 0 1.29.44 1.29 1.11 0 .62-.34.93-1.08 1.38-.95.57-1.66 1.19-1.66 2.59v.38h1.72v-.25c0-.84.37-1.18 1.19-1.68.88-.53 1.57-1.19 1.57-2.52 0-1.76-1.39-2.43-2.98-2.43Z"
		/>
		<circle cx="12" cy="17.35" r="1" fill="currentColor" stroke="none" />
	</svg>
	<span>Help</span>
</button>

<style>
	.help-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		min-height: 1.75rem;
		padding: 0 0.55rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-default);
		background: color-mix(in srgb, var(--surface-panel) 88%, var(--surface-subtle) 12%);
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		cursor: pointer;
		vertical-align: middle;
		margin-left: var(--sp-2);
		line-height: 1;
		transition:
			border-color var(--transition-fast),
			color var(--transition-fast),
			background var(--transition-fast),
			box-shadow var(--transition-fast);
		flex-shrink: 0;
	}

	.help-btn:hover {
		border-color: var(--amber);
		color: var(--amber);
		background: color-mix(in srgb, rgba(var(--amber-rgb), 0.12) 72%, var(--surface-panel) 28%);
	}

	.help-btn:focus-visible {
		outline: var(--focus-outline);
		outline-offset: var(--focus-outline-offset);
		box-shadow: var(--focus-ring);
	}

	.help-btn svg {
		width: 0.85rem;
		height: 0.85rem;
	}
</style>
