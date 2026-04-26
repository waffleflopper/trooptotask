<script lang="ts">
	import { SlidersHorizontal } from '@lucide/svelte';
	import { onMount, tick } from 'svelte';
	import type { Snippet } from 'svelte';
	import { getToolbarCoordinator } from './toolbarCoordinator';
	import type { ToolbarPanelMode, ToolbarStatefulControlMode } from './toolbar.types';

	interface Props {
		label: string;
		activeCount?: number;
		mode?: ToolbarStatefulControlMode;
		compactBreakpoint?: number;
		panelMode?: ToolbarPanelMode;
		testId?: string;
		full?: Snippet;
		panel?: Snippet;
	}

	let {
		label,
		activeCount = 0,
		mode = 'auto',
		compactBreakpoint = 560,
		panelMode = 'inline',
		testId,
		full,
		panel
	}: Props = $props();

	let open = $state(false);
	let hostEl: HTMLElement | undefined = $state();
	let triggerEl: HTMLButtonElement | undefined = $state();
	let panelEl: HTMLElement | undefined = $state();
	let measuredWidth = $state<number | null>(null);
	const coordinator = getToolbarCoordinator();
	const panelId = $derived(`group:${testId ?? label}`);

	const active = $derived(activeCount > 0);
	const compact = $derived(
		mode === 'compact' ||
			(mode === 'auto' &&
				(coordinator
					? coordinator.compactPhase === 'group'
					: measuredWidth !== null && measuredWidth < compactBreakpoint))
	);
	const panelOpen = $derived(coordinator ? coordinator.openPanelId === panelId : open);
	const panelTestId = $derived(testId ? `${testId}-panel` : undefined);

	$effect(() => {
		if (!compact) {
			closePanel();
		}
	});

	$effect(() => {
		if (!panelOpen) return;

		void tick().then(() => {
			focusFirstPanelElement();
		});
	});

	function togglePanel(): void {
		if (panelOpen) {
			closePanel();
		} else if (coordinator) {
			coordinator.requestPanel(panelId, 'group');
		} else {
			open = true;
		}
	}

	function closePanel(restoreFocus = false): void {
		if (coordinator) {
			coordinator.closePanel(panelId);
		} else {
			open = false;
		}
		if (restoreFocus) {
			triggerEl?.focus();
		}
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape') return;
		closePanel(true);
	}

	function getFocusablePanelElements(): HTMLElement[] {
		if (!panelEl) return [];
		return Array.from(
			panelEl.querySelectorAll<HTMLElement>(
				'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
			)
		);
	}

	function focusFirstPanelElement(): void {
		const [firstElement] = getFocusablePanelElements();
		(firstElement ?? panelEl)?.focus();
	}

	function handlePanelKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			closePanel(true);
			return;
		}
		if (event.key !== 'Tab') return;

		const focusableElements = getFocusablePanelElements();
		if (focusableElements.length === 0) {
			event.preventDefault();
			panelEl?.focus();
			return;
		}

		const firstElement = focusableElements[0];
		const lastElement = focusableElements[focusableElements.length - 1];
		const activeElement = document.activeElement;

		if (event.shiftKey && activeElement === firstElement) {
			event.preventDefault();
			lastElement.focus();
		} else if (!event.shiftKey && activeElement === lastElement) {
			event.preventDefault();
			firstElement.focus();
		}
	}

	function handleDocumentMouseDown(event: MouseEvent): void {
		if (!panelOpen || !hostEl) return;
		const target = event.target;
		if (!(target instanceof Node) || hostEl.contains(target)) return;
		closePanel();
	}

	function measure(): void {
		if (!hostEl || mode !== 'auto') return;
		const width = hostEl.getBoundingClientRect().width || hostEl.clientWidth;
		measuredWidth = width > 0 ? width : null;
	}

	onMount(() => {
		if (typeof window === 'undefined') return;

		const resizeObserver =
			typeof ResizeObserver === 'undefined'
				? null
				: new ResizeObserver(() => {
						measure();
					});

		if (hostEl) resizeObserver?.observe(hostEl);
		document.addEventListener('mousedown', handleDocumentMouseDown);
		window.requestAnimationFrame(measure);

		return () => {
			resizeObserver?.disconnect();
			document.removeEventListener('mousedown', handleDocumentMouseDown);
		};
	});
</script>

{#if !compact}
	<div class="toolbar-group" role="group" aria-label={label} data-testid={testId} bind:this={hostEl}>
		{#if full}
			{@render full()}
		{/if}
	</div>
{:else}
	<div
		class="toolbar-group toolbar-group--compact"
		role="group"
		aria-label={label}
		data-panel-mode={panelMode}
		data-testid={testId}
		bind:this={hostEl}
	>
		<button
			type="button"
			class="toolbar-group__trigger btn btn-sm"
			class:toolbar-group__trigger--active={active}
			aria-label={label}
			aria-expanded={panelOpen}
			data-active-count={activeCount}
			bind:this={triggerEl}
			onclick={togglePanel}
			onkeydown={handleKeydown}
		>
			<SlidersHorizontal size={16} strokeWidth={2} aria-hidden="true" />
			<span>{label}</span>
			{#if active}
				<span class="toolbar-group__count" aria-hidden="true">{activeCount} active</span>
			{/if}
		</button>

		{#if panelOpen}
			<div
				class="toolbar-group__panel"
				role="dialog"
				aria-label={`${label} panel`}
				data-testid={panelTestId}
				tabindex="-1"
				bind:this={panelEl}
				onkeydown={handlePanelKeydown}
			>
				{#if panel}
					{@render panel()}
				{:else if full}
					{@render full()}
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	.toolbar-group {
		position: relative;
		display: flex;
		align-items: center;
		flex-wrap: nowrap;
		flex: 0 0 auto;
		gap: var(--sp-2);
		min-width: 0;
	}

	.toolbar-group--compact {
		display: inline-flex;
	}

	.toolbar-group__trigger {
		position: relative;
		gap: var(--sp-2);
		color: var(--text-secondary);
	}

	.toolbar-group__trigger--active {
		border-color: var(--color-chrome-active);
		color: var(--color-chrome-active);
		background: rgba(var(--amber-rgb), 0.1);
	}

	.toolbar-group__count {
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

	.toolbar-group__panel {
		position: absolute;
		z-index: var(--z-tooltip);
		top: calc(100% + var(--sp-2));
		left: 0;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-2);
		width: min(24rem, calc(100vw - var(--sp-6)));
		padding: var(--sp-2);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		box-shadow: var(--shadow-md);
	}

	.toolbar-group__panel :global(.segmented-control) {
		flex: 0 0 auto;
	}

	.toolbar-group__panel :global(.toolbar-toggle) {
		flex: 0 0 auto;
	}

	.toolbar-group__panel :global(.toolbar-select) {
		flex: 1 1 100%;
		width: 100%;
		max-width: none;
	}
</style>
