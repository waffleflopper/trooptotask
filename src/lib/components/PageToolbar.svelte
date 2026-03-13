<script lang="ts">
	import type { Snippet } from 'svelte';
	import OverflowMenu, { type OverflowItem } from './ui/OverflowMenu.svelte';
	import HelpButton from './ui/HelpButton.svelte';

	interface Props {
		title: string;
		helpTopic?: string;
		overflowItems?: OverflowItem[];
		children?: Snippet;
	}

	let { title, helpTopic, overflowItems = [], children }: Props = $props();

	let showOverflow = $state(false);
</script>

<div class="page-toolbar">
	<h2 class="toolbar-title">{title}{#if helpTopic}<HelpButton topic={helpTopic} />{/if}</h2>

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
				<span>More</span>
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<polyline points="6 9 12 15 18 9" />
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
		gap: 4px;
		width: auto;
		height: 32px;
		padding: var(--spacing-xs) var(--spacing-sm);
		background: transparent;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		font-family: var(--font-mono);
		font-size: var(--font-size-sm);
		cursor: pointer;
		transition: background var(--transition-fast);
	}

	.more-btn:hover {
		background: var(--color-surface-variant);
	}

	@media (max-width: 640px) {
		.page-toolbar {
			padding: var(--spacing-sm) var(--spacing-md);
			flex-wrap: wrap;
		}

		.toolbar-actions {
			order: 3;
			width: 100%;
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
			padding-bottom: var(--spacing-xs);
		}

		.toolbar-actions :global(.btn) {
			white-space: nowrap;
			font-size: var(--font-size-sm);
			padding: 6px 12px;
			min-height: 32px;
		}
	}
</style>
