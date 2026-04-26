<script lang="ts">
	import OverflowMenu from './OverflowMenu.svelte';
	import ToolbarIcon from './toolbar/ToolbarIcon.svelte';
	import { getToolbarCoordinator } from './toolbar/toolbarCoordinator';
	import type { ToolbarActionIcon } from './toolbar/toolbar.types';
	import type { OverflowItem } from './OverflowMenu.types';

	interface Props {
		items: OverflowItem[];
		ariaLabel: string;
		label?: string;
		icon?: ToolbarActionIcon;
		idSeed?: string;
		iconOnly?: boolean;
		align?: 'left' | 'right';
		side?: 'bottom' | 'top';
		disabled?: boolean;
		disabledReason?: string;
	}

	let {
		items,
		ariaLabel,
		label = 'More',
		icon,
		idSeed,
		iconOnly = false,
		align = 'right',
		side = 'bottom',
		disabled = false,
		disabledReason
	}: Props = $props();
	let open = $state(false);
	const coordinator = getToolbarCoordinator();
	const menuId = $derived(idSeed ?? `toolbar-overflow-${ariaLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
	const menuOpenEvent = 'toolbar-overflow-menu-open';
	const disabledReasonId = $derived(disabledReason ? `${menuId}-disabled-reason` : undefined);

	function toggleOpen(): void {
		const nextOpen = !open;
		if (nextOpen) {
			coordinator?.closeAllPanels();
			window.dispatchEvent(new CustomEvent(menuOpenEvent, { detail: menuId }));
		}
		open = nextOpen;
	}

	$effect(() => {
		if (typeof window === 'undefined') return;

		function handleOtherMenuOpen(event: Event): void {
			if ((event as CustomEvent<string>).detail !== menuId) {
				open = false;
			}
		}

		window.addEventListener(menuOpenEvent, handleOtherMenuOpen);

		return () => {
			window.removeEventListener(menuOpenEvent, handleOtherMenuOpen);
		};
	});
</script>

<div class="toolbar-overflow-menu">
	<button
		type="button"
		class="toolbar-overflow-menu__button"
		class:toolbar-overflow-menu__button--icon={iconOnly}
		aria-label={ariaLabel}
		title={disabledReason ?? (iconOnly ? ariaLabel : undefined)}
		aria-expanded={open}
		aria-haspopup="menu"
		aria-describedby={disabledReasonId}
		{disabled}
		onmousedown={(event) => event.stopPropagation()}
		onclick={toggleOpen}
	>
		{#if iconOnly}
			{#if icon}
				<ToolbarIcon {icon} />
			{:else}
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
			{/if}
		{:else}
			{#if icon}
				<ToolbarIcon {icon} />
			{/if}
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
	{#if disabledReason}
		<span id={disabledReasonId} class="toolbar-overflow-menu__reason">{disabledReason}</span>
	{/if}
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

	.toolbar-overflow-menu__reason {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
