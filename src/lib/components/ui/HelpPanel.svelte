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
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="help-backdrop" onclick={handleBackdropClick}></div>
	<aside class="help-panel" role="complementary" aria-label="Help">
		<div class="help-header">
			<h2 class="help-title">{topic.title}</h2>
			<button class="help-close" onclick={() => helpStore.close()} aria-label="Close help">
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
{/if}

<style>
	.help-backdrop {
		position: fixed;
		inset: 0;
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
		background: var(--color-surface);
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
		padding: var(--spacing-md) var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	.help-title {
		font-size: var(--font-size-lg);
		font-weight: 600;
		color: var(--color-text);
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
		color: var(--color-text-muted);
		cursor: pointer;
		border-radius: var(--radius-sm);
		padding: 0;
	}

	.help-close:hover {
		background: var(--color-surface-variant);
		color: var(--color-text);
	}

	.help-close svg {
		width: 18px;
		height: 18px;
	}

	.help-body {
		padding: var(--spacing-lg);
		overflow-y: auto;
		flex: 1;
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		line-height: 1.6;
	}

	.help-body :global(h4) {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text);
		margin: var(--spacing-md) 0 var(--spacing-sm);
	}

	.help-body :global(p) {
		margin: 0 0 var(--spacing-sm);
	}

	.help-body :global(ul) {
		margin: 0 0 var(--spacing-sm);
		padding-left: var(--spacing-lg);
	}

	.help-body :global(li) {
		margin-bottom: var(--spacing-xs);
	}
</style>
