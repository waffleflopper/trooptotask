<script lang="ts">
	import { Search } from '@lucide/svelte';
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
	let localOpen = $state(false);

	const active = $derived(value.trim().length > 0);
	const compact = $derived(mode === 'compact' || (mode === 'auto' && coordinator?.compactPhase !== 'full'));
	const open = $derived(coordinator ? coordinator.openPanelId === panelId : localOpen);
	const resolvedTriggerTitle = $derived(triggerTitle ?? ariaLabel);

	$effect(() => {
		if (!compact) {
			closePanel();
		}
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
			onclick={togglePanel}
			onkeydown={handleTriggerKeydown}
		>
			<Search size={16} strokeWidth={2} aria-hidden="true" />
		</button>

		{#if open}
			<div class="toolbar-search-item__panel" data-testid={testId ? `${testId}-panel` : undefined}>
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
		position: absolute;
		z-index: 20;
		top: calc(100% + var(--sp-2));
		left: 0;
		width: min(22rem, calc(100vw - var(--sp-6)));
		padding: var(--sp-2);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		box-shadow: var(--shadow-md);
	}

	.toolbar-search-item__panel :global(.toolbar-search) {
		width: 100%;
	}
</style>
