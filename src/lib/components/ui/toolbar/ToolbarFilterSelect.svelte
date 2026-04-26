<script lang="ts">
	import { Filter } from '@lucide/svelte';
	import ToolbarSelect from '$lib/components/ui/ToolbarSelect.svelte';
	import { getToolbarCoordinator } from './toolbarCoordinator';
	import type { ToolbarSelectOption } from '$lib/components/ui/ToolbarSelect.svelte';
	import type { ToolbarPanelMode, ToolbarStatefulControlMode } from './toolbar.types';

	interface Props {
		ariaLabel: string;
		options: ToolbarSelectOption[];
		value?: string;
		defaultValue?: string;
		width?: 'default' | 'wide';
		mode?: ToolbarStatefulControlMode;
		panelMode?: ToolbarPanelMode;
		title?: string;
		onValueChange?: (value: string) => void;
	}

	let {
		ariaLabel,
		options,
		value = $bindable(''),
		defaultValue = '',
		width = 'default',
		mode = 'compact',
		panelMode = 'inline',
		title,
		onValueChange
	}: Props = $props();

	let open = $state(false);
	const coordinator = getToolbarCoordinator();

	const active = $derived(value !== defaultValue);
	const selectedLabel = $derived(options.find((option) => option.value === value)?.label ?? ariaLabel);
	const compact = $derived(
		mode === 'compact' || (mode === 'auto' && coordinator ? coordinator.compactPhase !== 'full' : false)
	);
	const resolvedTitle = $derived(title ?? `${ariaLabel}: ${selectedLabel}`);

	$effect(() => {
		if (!compact) {
			open = false;
		}
	});

	function togglePanel(): void {
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
	<ToolbarSelect {ariaLabel} {options} {width} bind:value {onValueChange} />
{:else}
	<div class="toolbar-filter-select" data-panel-mode={panelMode}>
		<button
			type="button"
			class="toolbar-filter-select__trigger btn btn-sm"
			class:toolbar-filter-select__trigger--active={active}
			aria-label={resolvedTitle}
			title={resolvedTitle}
			aria-expanded={open}
			data-filter-active={active}
			onclick={togglePanel}
			onkeydown={handleKeydown}
		>
			<Filter size={16} strokeWidth={2} aria-hidden="true" />
			<span>{selectedLabel}</span>
		</button>

		{#if open}
			<div
				class="toolbar-filter-select__panel"
				role="dialog"
				aria-label={`${ariaLabel} panel`}
				tabindex="-1"
				onkeydown={handleKeydown}
			>
				<ToolbarSelect {ariaLabel} {options} width="wide" bind:value {onValueChange} />
			</div>
		{/if}
	</div>
{/if}

<style>
	.toolbar-filter-select {
		position: relative;
		display: inline-flex;
		min-width: 0;
	}

	.toolbar-filter-select__trigger {
		gap: var(--sp-2);
		color: var(--text-secondary);
	}

	.toolbar-filter-select__trigger--active {
		border-color: var(--color-chrome-active);
		color: var(--color-chrome-active);
		background: rgba(var(--amber-rgb), 0.1);
	}

	.toolbar-filter-select__panel {
		position: absolute;
		z-index: var(--z-tooltip);
		top: calc(100% + var(--sp-2));
		left: 0;
		width: min(18rem, calc(100vw - var(--sp-6)));
		padding: var(--sp-2);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		box-shadow: var(--shadow-md);
	}

	.toolbar-filter-select__panel :global(.toolbar-select) {
		width: 100%;
		max-width: none;
	}
</style>
