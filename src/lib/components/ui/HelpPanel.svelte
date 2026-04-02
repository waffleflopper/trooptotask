<script lang="ts">
	import { helpStore } from '$lib/stores/help.svelte';
	import { helpContent } from '$lib/help-content';

	const topic = $derived(helpStore.activeTopic ? helpContent[helpStore.activeTopic] : null);

	function handleBackdropClick() {
		helpStore.close();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') helpStore.close();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if topic}
	<aside class="help-panel" aria-label="Help">
		<div class="help-header">
			<h2 class="help-title">{topic.title}</h2>
			<button type="button" class="help-close" onclick={() => helpStore.close()} aria-label="Close help">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12" />
				</svg>
			</button>
		</div>
		<div class="help-body">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- developer-controlled static help content, not user input -->
			{@html topic.content}
		</div>
	</aside>
	<button type="button" class="help-backdrop" onclick={handleBackdropClick} aria-label="Close help panel"></button>
{/if}

<style>
	.help-backdrop {
		position: fixed;
		inset: 0;
		border: none;
		padding: 0;
		background: rgba(0, 0, 0, 0.3);
		z-index: 999;
	}

	.help-panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: 380px;
		max-width: 90vw;
		background: var(--surface-panel);
		box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
		z-index: 1000;
		display: flex;
		flex-direction: column;
		animation: slideIn 0.2s ease-out;
	}

	@keyframes slideIn {
		from {
			transform: translateX(100%);
		}
		to {
			transform: translateX(0);
		}
	}

	.help-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--sp-4) var(--sp-6);
		border-bottom: 1px solid var(--border-default);
		flex-shrink: 0;
	}

	.help-title {
		font-size: var(--text-base);
		font-weight: 600;
		color: var(--text-primary);
		margin: 0;
	}

	.help-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		background: transparent;
		color: var(--text-tertiary);
		cursor: pointer;
		border-radius: var(--radius-sm);
		padding: 0;
	}

	.help-close:hover {
		background: var(--surface-subtle);
		color: var(--text-primary);
	}

	.help-close:focus-visible {
		outline: var(--focus-outline);
		outline-offset: var(--focus-outline-offset);
		box-shadow: var(--focus-ring);
	}

	.help-close svg {
		width: 18px;
		height: 18px;
	}

	.help-body {
		padding: var(--sp-6);
		overflow-y: auto;
		flex: 1;
		font-size: var(--text-ui-sm);
		color: var(--text-secondary);
		line-height: 1.6;
	}

	.help-body :global(h4) {
		font-size: var(--text-ui-sm);
		font-weight: 600;
		color: var(--text-primary);
		margin: var(--sp-4) 0 var(--sp-2);
	}

	.help-body :global(p) {
		margin: 0 0 var(--sp-2);
	}

	.help-body :global(ul) {
		margin: 0 0 var(--sp-2);
		padding-left: var(--sp-6);
	}

	.help-body :global(li) {
		margin-bottom: var(--sp-1);
	}
</style>
