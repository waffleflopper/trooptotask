<script lang="ts">
	import { onMount, setContext } from 'svelte';
	import type { Snippet } from 'svelte';
	import {
		toolbarCoordinatorKey,
		type ToolbarCompactPhase,
		type ToolbarCoordinator,
		type ToolbarPanelKind
	} from '$lib/components/ui/toolbar/toolbarCoordinator';

	interface Props {
		ariaLabel: string;
		leadingMin?: string;
		collapse?: 'wide' | 'medium' | 'narrow';
		containerWidth?: number;
		searchCompactAt?: number;
		groupCompactAt?: number;
		leading?: Snippet;
		children?: Snippet;
		overflow?: Snippet;
	}

	let {
		ariaLabel,
		leadingMin = '18rem',
		collapse = 'wide',
		containerWidth,
		searchCompactAt = 840,
		groupCompactAt = 640,
		leading,
		children,
		overflow
	}: Props = $props();

	let toolbarEl: HTMLElement | undefined = $state();
	let leadingEl: HTMLElement | undefined = $state();
	let actionsEl: HTMLElement | undefined = $state();
	let overflowEl: HTMLElement | undefined = $state();
	let measuredContainerWidth = $state<number | null>(null);
	let availableActionWidth = $state<number | null>(null);
	let openPanelId = $state<string | null>(null);
	const resolvedContainerWidth = $derived(containerWidth ?? measuredContainerWidth);
	const compactPhase = $derived<ToolbarCompactPhase>(
		resolvedContainerWidth === null || resolvedContainerWidth >= searchCompactAt
			? 'full'
			: resolvedContainerWidth >= groupCompactAt
				? 'search'
				: 'group'
	);

	const coordinator: ToolbarCoordinator = {
		get openPanelId() {
			return openPanelId;
		},
		get compactPhase() {
			return compactPhase;
		},
		get availableActionWidth() {
			return availableActionWidth;
		},
		requestPanel(panelId: string, _kind: ToolbarPanelKind) {
			openPanelId = panelId;
		},
		closePanel(panelId: string) {
			if (openPanelId === panelId) {
				openPanelId = null;
			}
		},
		closeAllPanels() {
			openPanelId = null;
		}
	};

	setContext(toolbarCoordinatorKey, coordinator);

	const toolbarClass = $derived(
		[
			'floating-page-toolbar',
			`floating-page-toolbar--${collapse}`,
			`floating-page-toolbar--compact-${compactPhase}`,
			overflow ? 'floating-page-toolbar--has-overflow' : ''
		]
			.filter(Boolean)
			.join(' ')
	);

	$effect(() => {
		if (containerWidth !== undefined) {
			measuredContainerWidth = containerWidth;
			measureAvailableActionWidth();
		} else {
			measure();
		}
	});

	function measure(): void {
		if (!toolbarEl || containerWidth !== undefined) return;
		const width = toolbarEl.getBoundingClientRect().width || toolbarEl.clientWidth;
		measuredContainerWidth = width > 0 ? width : null;
		measureAvailableActionWidth();
	}

	function measureAvailableActionWidth(): void {
		if (!toolbarEl) {
			availableActionWidth = null;
			return;
		}

		const toolbarWidth = (containerWidth ?? toolbarEl.getBoundingClientRect().width) || toolbarEl.clientWidth;
		if (!toolbarWidth || toolbarWidth <= 0) {
			availableActionWidth = null;
			return;
		}

		const styles = getComputedStyle(toolbarEl);
		const paddingInline = (Number.parseFloat(styles.paddingLeft) || 0) + (Number.parseFloat(styles.paddingRight) || 0);
		const gapWidth = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
		const leadingContentEl =
			leadingEl?.firstElementChild instanceof HTMLElement ? leadingEl.firstElementChild : leadingEl;
		const leadingWidth = leadingContentEl
			? Math.max(leadingContentEl.getBoundingClientRect().width, leadingContentEl.scrollWidth)
			: 0;
		const overflowWidth =
			overflowEl && overflow ? Math.max(overflowEl.getBoundingClientRect().width, overflowEl.scrollWidth) : 0;
		const occupiedSlots = [leadingEl, actionsEl, overflowEl].filter(Boolean).length;
		const gapTotal = occupiedSlots > 1 ? gapWidth * (occupiedSlots - 1) : 0;

		availableActionWidth = Math.max(0, toolbarWidth - paddingInline - leadingWidth - overflowWidth - gapTotal);
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape' || !openPanelId) return;
		openPanelId = null;
	}

	onMount(() => {
		if (typeof window === 'undefined') return;

		const resizeObserver =
			typeof ResizeObserver === 'undefined'
				? null
				: new ResizeObserver(() => {
						measure();
					});

		for (const element of [toolbarEl, leadingEl, actionsEl, overflowEl]) {
			if (element) resizeObserver?.observe(element);
		}
		window.addEventListener('resize', measure);
		window.addEventListener('keydown', handleKeydown);
		window.requestAnimationFrame(measure);

		return () => {
			resizeObserver?.disconnect();
			window.removeEventListener('resize', measure);
			window.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

<div
	role="toolbar"
	class={toolbarClass}
	aria-label={ariaLabel}
	data-floating-page-toolbar
	data-testid="floating-page-toolbar"
	data-toolbar-compact-phase={compactPhase}
	style:--toolbar-leading-min={leadingMin}
	bind:this={toolbarEl}
>
	<div class="floating-page-toolbar__leading" bind:this={leadingEl}>
		{#if leading}
			{@render leading()}
		{/if}
	</div>

	{#if children}
		<div class="floating-page-toolbar__actions" bind:this={actionsEl}>
			{@render children()}
		</div>
	{/if}

	{#if overflow}
		<div class="floating-page-toolbar__overflow" bind:this={overflowEl}>
			{@render overflow()}
		</div>
	{/if}
</div>

<style>
	.floating-page-toolbar {
		display: flex;
		align-items: center;
		flex-wrap: nowrap;
		gap: var(--sp-3);
		box-sizing: border-box;
		width: 100%;
		min-height: 58px;
		min-width: 0;
		padding: var(--sp-3);
		background: var(--surface-panel);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
	}

	.floating-page-toolbar__leading,
	.floating-page-toolbar__actions,
	.floating-page-toolbar__overflow {
		display: flex;
		align-items: center;
		align-self: center;
		flex-wrap: nowrap;
		gap: var(--sp-2);
		min-width: 0;
	}

	.floating-page-toolbar__leading {
		flex: 1 1 auto;
		justify-content: flex-start;
	}

	.floating-page-toolbar__actions {
		flex: 0 0 auto;
		justify-content: flex-end;
	}

	.floating-page-toolbar__overflow {
		justify-content: flex-end;
	}
</style>
