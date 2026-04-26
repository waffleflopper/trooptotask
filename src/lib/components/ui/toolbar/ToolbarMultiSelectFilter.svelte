<script lang="ts">
	import { ListFilter } from '@lucide/svelte';
	import MultiTagSelect from '$lib/components/ui/MultiTagSelect.svelte';
	import type { TagOption } from '$lib/components/ui/MultiTagSelect.svelte';
	import { getToolbarCoordinator } from './toolbarCoordinator';
	import type { ToolbarPanelMode, ToolbarStatefulControlMode } from './toolbar.types';

	interface Props {
		ariaLabel: string;
		label: string;
		options: TagOption[];
		value?: string[];
		defaultValue?: string[];
		placeholder?: string;
		disabled?: boolean;
		mode?: ToolbarStatefulControlMode;
		panelMode?: ToolbarPanelMode;
		maxWidth?: string;
		onChange: (values: string[]) => void;
	}

	let {
		ariaLabel,
		label,
		options,
		value = $bindable([]),
		defaultValue = [],
		placeholder = 'Select...',
		disabled = false,
		mode = 'compact',
		panelMode = 'inline',
		maxWidth = '34rem',
		onChange
	}: Props = $props();

	let open = $state(false);
	const coordinator = getToolbarCoordinator();

	const selectedCount = $derived(value.length);
	const defaultSet = $derived(new Set(defaultValue));
	const active = $derived(value.length !== defaultValue.length || value.some((item) => !defaultSet.has(item)));
	const compact = $derived(
		mode === 'compact' || (mode === 'auto' && coordinator ? coordinator.compactPhase !== 'full' : false)
	);
	const triggerLabel = $derived(selectedCount > 0 ? `${label}: ${selectedCount} selected` : label);

	$effect(() => {
		if (!compact) {
			open = false;
		}
	});

	function togglePanel(): void {
		if (disabled) return;
		open = !open;
	}

	function closePanel(): void {
		open = false;
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape') return;
		closePanel();
	}
</script>

{#if !compact}
	<div
		class="toolbar-multi-select-filter toolbar-multi-select-filter--full"
		style:--toolbar-multi-select-max-width={maxWidth}
	>
		<MultiTagSelect {options} {value} {placeholder} {ariaLabel} {disabled} {onChange} />
	</div>
{:else}
	<div
		class="toolbar-multi-select-filter"
		data-panel-mode={panelMode}
		style:--toolbar-multi-select-max-width={maxWidth}
	>
		<button
			type="button"
			class="toolbar-multi-select-filter__trigger btn btn-sm"
			class:toolbar-multi-select-filter__trigger--active={active}
			aria-label={triggerLabel}
			title={triggerLabel}
			aria-expanded={open}
			data-filter-active={active}
			{disabled}
			onclick={togglePanel}
			onkeydown={handleKeydown}
		>
			<ListFilter size={16} strokeWidth={2} aria-hidden="true" />
			<span>{label}</span>
			{#if selectedCount > 0}
				<span class="toolbar-multi-select-filter__count" aria-hidden="true">{selectedCount} selected</span>
			{/if}
		</button>

		{#if open}
			<div
				class="toolbar-multi-select-filter__panel"
				role="dialog"
				aria-label={`${ariaLabel} panel`}
				tabindex="-1"
				onkeydown={handleKeydown}
			>
				<MultiTagSelect {options} {value} {placeholder} {ariaLabel} {disabled} {onChange} />
			</div>
		{/if}
	</div>
{/if}

<style>
	.toolbar-multi-select-filter {
		position: relative;
		display: inline-flex;
		min-width: 0;
	}

	.toolbar-multi-select-filter--full {
		flex: 1 1 18rem;
		width: min(var(--toolbar-multi-select-max-width), 100%);
		max-width: min(var(--toolbar-multi-select-max-width), 100%);
	}

	.toolbar-multi-select-filter__trigger {
		gap: var(--sp-2);
		color: var(--text-secondary);
	}

	.toolbar-multi-select-filter__trigger--active {
		border-color: var(--color-chrome-active);
		color: var(--color-chrome-active);
		background: rgba(var(--amber-rgb), 0.1);
	}

	.toolbar-multi-select-filter__count {
		display: inline-flex;
		align-items: center;
		min-height: 1.15rem;
		padding: 0 var(--sp-2);
		border-radius: 999px;
		background: currentColor;
		color: var(--surface-panel);
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		font-weight: var(--font-weight-semibold);
		text-transform: uppercase;
	}

	.toolbar-multi-select-filter__panel {
		position: absolute;
		z-index: var(--z-tooltip);
		top: calc(100% + var(--sp-2));
		left: 0;
		width: min(var(--toolbar-multi-select-max-width), calc(100vw - var(--sp-6)));
		padding: var(--sp-2);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		box-shadow: var(--shadow-md);
	}

	.toolbar-multi-select-filter :global(.mts) {
		width: 100%;
	}

	.toolbar-multi-select-filter :global(.mts-control) {
		min-height: 34px;
		background: var(--surface-panel);
	}

	.toolbar-multi-select-filter--full :global(.mts-control) {
		flex-wrap: nowrap;
		overflow: hidden;
	}

	.toolbar-multi-select-filter--full :global(.mts-tag) {
		flex: 0 1 auto;
	}

	.toolbar-multi-select-filter--full :global(.mts-input) {
		min-width: 7rem;
	}
</style>
