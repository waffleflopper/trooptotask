<script lang="ts">
	import { Rows3 } from '@lucide/svelte';
	import SegmentedControl, { type SegmentedControlOption } from '$lib/components/ui/SegmentedControl.svelte';
	import type { ToolbarPanelMode, ToolbarStatefulControlMode } from './toolbar.types';

	interface Props {
		ariaLabel: string;
		options: SegmentedControlOption[];
		value?: string;
		mode?: ToolbarStatefulControlMode;
		panelMode?: ToolbarPanelMode;
		title?: string;
		onValueChange?: (value: string) => void;
	}

	let {
		ariaLabel,
		options,
		value = $bindable(''),
		mode = 'compact',
		panelMode = 'inline',
		title,
		onValueChange
	}: Props = $props();

	let open = $state(false);

	const compact = $derived(mode === 'compact');
	const selectedOption = $derived(options.find((option) => option.value === value));
	const selectedLabel = $derived(selectedOption?.label ?? ariaLabel);
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

	function handleValueChange(nextValue: string): void {
		value = nextValue;
		onValueChange?.(nextValue);
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape') return;
		closePanel();
	}
</script>

{#if !compact}
	<SegmentedControl {ariaLabel} {options} bind:value onValueChange={handleValueChange} />
{:else}
	<div class="toolbar-view-toggle" data-panel-mode={panelMode}>
		<button
			type="button"
			class="toolbar-view-toggle__trigger btn btn-sm"
			aria-label={resolvedTitle}
			title={resolvedTitle}
			aria-expanded={open}
			onclick={togglePanel}
			onkeydown={handleKeydown}
		>
			<Rows3 size={16} strokeWidth={2} aria-hidden="true" />
			<span>{selectedLabel}</span>
		</button>

		{#if open}
			<div
				class="toolbar-view-toggle__panel"
				role="dialog"
				aria-label={`${ariaLabel} panel`}
				tabindex="-1"
				onkeydown={handleKeydown}
			>
				<SegmentedControl {ariaLabel} {options} bind:value onValueChange={handleValueChange} />
			</div>
		{/if}
	</div>
{/if}

<style>
	.toolbar-view-toggle {
		position: relative;
		display: inline-flex;
		min-width: 0;
	}

	.toolbar-view-toggle__trigger {
		gap: var(--sp-2);
		color: var(--text-secondary);
	}

	.toolbar-view-toggle__panel {
		position: absolute;
		z-index: 20;
		top: calc(100% + var(--sp-2));
		left: 0;
		padding: var(--sp-2);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		box-shadow: var(--shadow-md);
	}
</style>
