<script lang="ts">
	import OverflowMenu from './OverflowMenu.svelte';
	import { getToolbarCoordinator } from './toolbar/toolbarCoordinator';
	import type { OverflowItem } from './OverflowMenu.types';

	interface Props {
		items: OverflowItem[];
		ariaLabel: string;
		label?: string;
		iconOnly?: boolean;
		align?: 'left' | 'right';
		side?: 'bottom' | 'top';
	}

	let { items, ariaLabel, label = 'More', iconOnly = false, align = 'right', side = 'bottom' }: Props = $props();
	let open = $state(false);
	const coordinator = getToolbarCoordinator();

	function toggleOpen(): void {
		const nextOpen = !open;
		if (nextOpen) {
			coordinator?.closeAllPanels();
		}
		open = nextOpen;
	}
</script>

<div class="toolbar-overflow-menu">
	<button
		type="button"
		class="toolbar-overflow-menu__button"
		class:toolbar-overflow-menu__button--icon={iconOnly}
		aria-label={ariaLabel}
		title={iconOnly ? ariaLabel : undefined}
		aria-expanded={open}
		aria-haspopup="menu"
		onmousedown={(event) => event.stopPropagation()}
		onclick={toggleOpen}
	>
		{#if iconOnly}
			<svg
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<circle cx="12" cy="12" r="1" />
				<circle cx="12" cy="5" r="1" />
				<circle cx="12" cy="19" r="1" />
			</svg>
		{:else}
			<span>{label}</span>
			<svg
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<polyline points="6 9 12 15 18 9" />
			</svg>
		{/if}
	</button>
	<OverflowMenu {items} {align} {side} {open} onClose={() => (open = false)} />
</div>

<style>
	.toolbar-overflow-menu {
		position: relative;
	}

	.toolbar-overflow-menu__button {
		appearance: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-1);
		min-height: 34px;
		padding: 7px 12px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		white-space: nowrap;
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.toolbar-overflow-menu__button--icon {
		width: 34px;
		padding: 7px;
	}

	.toolbar-overflow-menu__button:hover {
		background: var(--surface-subtle);
		border-color: var(--ink-35);
		color: var(--text-primary);
	}

	.toolbar-overflow-menu__button:focus-visible {
		outline: var(--focus-outline);
		outline-offset: var(--focus-outline-offset);
		box-shadow: var(--focus-ring);
	}
</style>
