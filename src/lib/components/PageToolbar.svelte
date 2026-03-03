<script lang="ts">
	import type { Snippet } from 'svelte';
	import OverflowMenu, { type OverflowItem } from './ui/OverflowMenu.svelte';

	interface Props {
		title: string;
		overflowItems?: OverflowItem[];
		children?: Snippet;
	}

	let { title, overflowItems = [], children }: Props = $props();

	let showOverflow = $state(false);
</script>

<div class="page-toolbar">
	<h2 class="toolbar-title">{title}</h2>

	{#if children}
		<div class="toolbar-actions">
			{@render children()}
		</div>
	{/if}

	{#if overflowItems.length > 0}
		<div class="overflow-wrapper">
			<button
				type="button"
				class="more-btn"
				aria-label="More actions"
				onclick={() => (showOverflow = !showOverflow)}
			>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
					<circle cx="8" cy="3" r="1.5" />
					<circle cx="8" cy="8" r="1.5" />
					<circle cx="8" cy="13" r="1.5" />
				</svg>
			</button>
			<OverflowMenu
				items={overflowItems}
				align="right"
				open={showOverflow}
				onClose={() => (showOverflow = false)}
			/>
		</div>
	{/if}
</div>

<style>
	.page-toolbar {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-lg);
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
	}

	.toolbar-title {
		font-family: var(--font-display);
		font-size: var(--font-size-lg);
		font-weight: 400;
		color: var(--color-text);
		margin: 0;
		flex: 1;
	}

	.toolbar-actions {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.overflow-wrapper {
		position: relative;
	}

	.more-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: transparent;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: 0;
		transition: background var(--transition-fast);
	}

	.more-btn:hover {
		background: var(--color-surface-variant);
	}

	@media (max-width: 639px) {
		.page-toolbar {
			padding: var(--spacing-sm) var(--spacing-md);
		}

		.toolbar-actions {
			display: none;
		}
	}
</style>
