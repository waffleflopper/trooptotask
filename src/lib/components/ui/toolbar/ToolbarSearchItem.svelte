<script lang="ts">
	import { Search } from '@lucide/svelte';
	import { onMount, tick } from 'svelte';
	import ToolbarSearch from '$lib/components/ui/ToolbarSearch.svelte';
	import { getToolbarCoordinator } from './toolbarCoordinator';
	import type { ToolbarSearchItemMode, ToolbarSearchPanelMode } from './toolbar.types';

	interface Props {
		ariaLabel: string;
		value?: string;
		placeholder?: string;
		testId?: string;
		width?: 'default' | 'wide' | 'full';
		mode?: ToolbarSearchItemMode;
		panelMode?: ToolbarSearchPanelMode;
		triggerTitle?: string;
		onValueChange?: (value: string) => void;
	}

	let {
		ariaLabel,
		value = $bindable(''),
		placeholder = 'Search...',
		testId,
		width = 'default',
		mode = 'auto',
		panelMode = 'inline',
		triggerTitle,
		onValueChange
	}: Props = $props();

	const coordinator = getToolbarCoordinator();
	const panelId = $derived(`search:${testId ?? ariaLabel}`);
	let triggerEl: HTMLButtonElement | undefined = $state();
	let localOpen = $state(false);
	let panelStyle = $state('');

	const active = $derived(value.trim().length > 0);
	const compact = $derived(
		mode === 'compact' || (mode === 'auto' && coordinator ? coordinator.compactPhase !== 'full' : false)
	);
	const open = $derived(coordinator ? coordinator.openPanelId === panelId : localOpen);
	const resolvedTriggerTitle = $derived(triggerTitle ?? ariaLabel);

	$effect(() => {
		if (!compact) {
			closePanel();
		}
	});

	$effect(() => {
		if (!open) return;
		tick().then(positionPanel);
	});

	function togglePanel(): void {
		if (open) {
			closePanel();
		} else {
			openPanel();
		}
	}

	function openPanel(): void {
		if (coordinator) {
			coordinator.requestPanel(panelId, 'search');
		} else {
			localOpen = true;
		}
	}

	function closePanel(): void {
		if (coordinator) {
			coordinator.closePanel(panelId);
		} else {
			localOpen = false;
		}
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape') return;
		closePanel();
	}

	function handleTriggerKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			closePanel();
			return;
		}

		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		togglePanel();
	}

	function positionPanel(): void {
		if (!triggerEl || typeof window === 'undefined') return;

		const viewportInset = 12;
		const triggerRect = triggerEl.getBoundingClientRect();
		const panelWidth = Math.min(352, Math.max(0, window.innerWidth - viewportInset * 2));
		const preferredLeft = triggerRect.left;
		const maxLeft = Math.max(viewportInset, window.innerWidth - viewportInset - panelWidth);
		const left = Math.min(Math.max(preferredLeft, viewportInset), maxLeft);
		const top = triggerRect.bottom + 8;

		panelStyle = `width: ${panelWidth}px; left: ${left}px; top: ${top}px;`;
	}

	onMount(() => {
		if (typeof window === 'undefined') return;

		function handleViewportChange(): void {
			if (open) positionPanel();
		}

		window.addEventListener('resize', handleViewportChange);
		window.addEventListener('scroll', handleViewportChange, true);

		return () => {
			window.removeEventListener('resize', handleViewportChange);
			window.removeEventListener('scroll', handleViewportChange, true);
		};
	});
</script>

{#if !compact}
	<ToolbarSearch {ariaLabel} {placeholder} {testId} {width} bind:value {onValueChange} />
{:else}
	<div class="toolbar-search-item toolbar-search-item--compact" data-panel-mode={panelMode}>
		<button
			type="button"
			class="toolbar-search-item__trigger btn btn-sm btn-icon"
			class:toolbar-search-item__trigger--active={active}
			aria-label={ariaLabel}
			title={resolvedTriggerTitle}
			aria-expanded={open}
			data-search-active={active}
			bind:this={triggerEl}
			onclick={togglePanel}
			onkeydown={handleTriggerKeydown}
		>
			<Search size={16} strokeWidth={2} aria-hidden="true" />
		</button>

		{#if open}
			<div class="toolbar-search-item__panel" style={panelStyle} data-testid={testId ? `${testId}-panel` : undefined}>
				<ToolbarSearch
					{ariaLabel}
					{placeholder}
					{testId}
					width="full"
					bind:value
					{onValueChange}
					onKeydown={handleKeydown}
				/>
			</div>
		{/if}
	</div>
{/if}

<style>
	.toolbar-search-item {
		position: relative;
		display: inline-flex;
		align-items: center;
		min-width: 0;
	}

	.toolbar-search-item__trigger {
		position: relative;
		color: var(--text-secondary);
	}

	.toolbar-search-item__trigger--active {
		border-color: var(--color-chrome-active);
		color: var(--color-chrome-active);
		background: rgba(var(--amber-rgb), 0.1);
	}

	.toolbar-search-item__trigger--active::after {
		position: absolute;
		right: 6px;
		top: 6px;
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background: currentColor;
		content: '';
	}

	.toolbar-search-item__panel {
		position: fixed;
		z-index: var(--z-tooltip);
		box-sizing: border-box;
		padding: var(--sp-2);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		box-shadow: var(--shadow-md);
	}

	.toolbar-search-item__panel :global(.toolbar-search) {
		box-sizing: border-box;
		width: 100%;
		max-width: none;
	}
</style>
