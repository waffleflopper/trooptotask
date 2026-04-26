<script lang="ts">
	import { onMount, setContext, tick } from 'svelte';
	import type { Snippet } from 'svelte';
	import {
		toolbarCoordinatorKey,
		type ToolbarCompactPhase,
		type ToolbarCoordinator,
		type ToolbarPanelKind
	} from '$lib/components/ui/toolbar/toolbarCoordinator';
	import { isToolbarLeadingContentCrowded } from '$lib/components/ui/toolbar/toolbarContentFit';

	interface Props {
		ariaLabel: string;
		leadingMin?: string;
		collapse?: 'wide' | 'medium' | 'narrow';
		containerWidth?: number;
		searchCompactAt?: number;
		groupCompactAt?: number;
		compactLeadingWhenCrowded?: boolean;
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
		compactLeadingWhenCrowded = false,
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
	let leadingContentCrowded = $state(false);
	let lastFullLeadingWidth = $state<number | null>(null);
	const resolvedContainerWidth = $derived(containerWidth ?? measuredContainerWidth);
	const widthCompactPhase = $derived<ToolbarCompactPhase>(
		resolvedContainerWidth === null || resolvedContainerWidth >= searchCompactAt
			? 'full'
			: resolvedContainerWidth >= groupCompactAt
				? 'search'
				: 'group'
	);
	const compactPhase = $derived<ToolbarCompactPhase>(leadingContentCrowded ? 'group' : widthCompactPhase);

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
		['toolbar', `toolbar--${collapse}`, `toolbar--compact-${compactPhase}`, overflow ? 'toolbar--has-overflow' : '']
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
			? leadingContentEl.getBoundingClientRect().width || leadingContentEl.clientWidth
			: 0;
		const leadingContentWidth = leadingContentEl ? measureFlexContentWidth(leadingContentEl) || leadingWidth : 0;
		const fullLeadingWidth = leadingContentCrowded
			? (lastFullLeadingWidth ?? leadingContentWidth)
			: leadingContentWidth;
		const actionSlotMetrics = measureActionSlot();
		const overflowWidth =
			overflowEl && overflow ? Math.max(overflowEl.getBoundingClientRect().width, overflowEl.scrollWidth) : 0;
		const occupiedSlots = [leadingEl, actionsEl, overflowEl].filter(Boolean).length;
		const gapTotal = occupiedSlots > 1 ? gapWidth * (occupiedSlots - 1) : 0;
		const actionSlotWidth = Math.max(actionSlotMetrics.requiredWidth, actionSlotMetrics.currentWidth);
		const nextLeadingContentCrowded =
			compactLeadingWhenCrowded &&
			fullLeadingWidth > 0 &&
			isToolbarLeadingContentCrowded({
				containerWidth: toolbarWidth,
				paddingInline,
				gapWidth,
				leadingWidth: fullLeadingWidth,
				actionsWidth: actionSlotWidth,
				overflowWidth,
				slotCount: occupiedSlots
			});

		if (!leadingContentCrowded && nextLeadingContentCrowded) {
			lastFullLeadingWidth = fullLeadingWidth;
			leadingContentCrowded = true;
			void tick().then(measureAvailableActionWidth);
			return;
		}

		if (leadingContentCrowded && !nextLeadingContentCrowded) {
			leadingContentCrowded = false;
			void tick().then(measureAvailableActionWidth);
			return;
		}

		const availableActionSlotWidth = Math.max(
			0,
			toolbarWidth - paddingInline - leadingWidth - overflowWidth - gapTotal
		);
		const measuredAvailableActionWidth = Math.max(0, availableActionSlotWidth - actionSlotMetrics.nonToolbarWidth);
		availableActionWidth =
			compactLeadingWhenCrowded && !nextLeadingContentCrowded
				? Math.max(measuredAvailableActionWidth, actionSlotMetrics.toolbarActionRequiredWidth)
				: measuredAvailableActionWidth;
	}

	function measureActionSlot(): {
		currentWidth: number;
		requiredWidth: number;
		nonToolbarWidth: number;
		toolbarActionRequiredWidth: number;
	} {
		if (!actionsEl) {
			return { currentWidth: 0, requiredWidth: 0, nonToolbarWidth: 0, toolbarActionRequiredWidth: 0 };
		}

		const children = Array.from(actionsEl.children).filter(
			(child): child is HTMLElement => child instanceof HTMLElement
		);
		const actionGap =
			Number.parseFloat(getComputedStyle(actionsEl).columnGap || getComputedStyle(actionsEl).gap || '0') || 0;
		const actionGroups = children.filter((child) => child.hasAttribute('data-toolbar-actions'));
		const nonToolbarChildren = children.filter((child) => !child.hasAttribute('data-toolbar-actions'));
		const nonToolbarWidth = sumElementWidths(nonToolbarChildren);
		const actionGroupRequiredWidth = actionGroups.reduce((total, child) => {
			const requiredWidth = Number.parseFloat(child.dataset.toolbarActionsRequiredWidth ?? '');
			return total + (Number.isFinite(requiredWidth) ? requiredWidth : measureElementWidth(child));
		}, 0);
		const gapTotal = children.length > 1 ? actionGap * (children.length - 1) : 0;

		return {
			currentWidth: Math.max(actionsEl.getBoundingClientRect().width, actionsEl.scrollWidth),
			requiredWidth: actionGroupRequiredWidth + nonToolbarWidth + gapTotal,
			nonToolbarWidth: nonToolbarWidth + gapTotal,
			toolbarActionRequiredWidth: actionGroupRequiredWidth
		};
	}

	function sumElementWidths(elements: HTMLElement[]): number {
		return elements.reduce((total, element) => total + measureElementWidth(element), 0);
	}

	function measureElementWidth(element: HTMLElement): number {
		return Math.max(element.getBoundingClientRect().width, element.scrollWidth, element.clientWidth);
	}

	function measureFlexContentWidth(element: HTMLElement): number {
		const styles = getComputedStyle(element);
		if (!styles.display.includes('flex')) {
			return measureElementWidth(element);
		}

		const children = Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
		if (children.length === 0) {
			return measureElementWidth(element);
		}

		const gapWidth = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
		const gapTotal = children.length > 1 ? gapWidth * (children.length - 1) : 0;
		const childWidth = children.reduce((total, child) => {
			const tagName = child.tagName.toLowerCase();
			const childDisplay = getComputedStyle(child).display;
			const childCanStretch =
				child.children.length > 0 &&
				childDisplay.includes('flex') &&
				tagName !== 'button' &&
				tagName !== 'select' &&
				tagName !== 'input';

			return total + (childCanStretch ? measureFlexContentWidth(child) : measureElementWidth(child));
		}, 0);

		return childWidth + gapTotal;
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
	data-toolbar
	data-testid="toolbar"
	data-toolbar-compact-phase={compactPhase}
	style:--toolbar-leading-min={leadingMin}
	bind:this={toolbarEl}
>
	<div class="toolbar__leading" bind:this={leadingEl}>
		{#if leading}
			{@render leading()}
		{/if}
	</div>

	{#if children}
		<div class="toolbar__actions" bind:this={actionsEl}>
			{@render children()}
		</div>
	{/if}

	{#if overflow}
		<div class="toolbar__overflow" bind:this={overflowEl}>
			{@render overflow()}
		</div>
	{/if}
</div>

<style>
	.toolbar {
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

	.toolbar__leading,
	.toolbar__actions,
	.toolbar__overflow {
		display: flex;
		align-items: center;
		align-self: center;
		flex-wrap: nowrap;
		gap: var(--sp-2);
		min-width: 0;
	}

	.toolbar__leading {
		flex: 1 1 auto;
		justify-content: flex-start;
	}

	.toolbar__actions {
		flex: 0 0 auto;
		justify-content: flex-end;
	}

	.toolbar__overflow {
		justify-content: flex-end;
	}
</style>
