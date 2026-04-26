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
		leading?: Snippet;
		children?: Snippet;
		overflow?: Snippet;
	}

	let {
		ariaLabel,
		leadingMin = '18rem',
		collapse = 'wide',
		containerWidth,
		leading,
		children,
		overflow
	}: Props = $props();

	let toolbarEl: HTMLElement | undefined = $state();
	let measuredContainerWidth = $state<number | null>(null);
	let openPanelId = $state<string | null>(null);
	const resolvedContainerWidth = $derived(containerWidth ?? measuredContainerWidth);
	const compactPhase = $derived<ToolbarCompactPhase>(
		resolvedContainerWidth === null || resolvedContainerWidth >= 840
			? 'full'
			: resolvedContainerWidth >= 640
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
		} else {
			measure();
		}
	});

	function measure(): void {
		if (!toolbarEl || containerWidth !== undefined) return;
		const width = toolbarEl.getBoundingClientRect().width || toolbarEl.clientWidth;
		measuredContainerWidth = width > 0 ? width : null;
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

		if (toolbarEl) resizeObserver?.observe(toolbarEl);
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
	<div class="floating-page-toolbar__leading">
		{#if leading}
			{@render leading()}
		{/if}
	</div>

	{#if children}
		<div class="floating-page-toolbar__actions">
			{@render children()}
		</div>
	{/if}

	{#if overflow}
		<div class="floating-page-toolbar__overflow">
			{@render overflow()}
		</div>
	{/if}
</div>

<style>
	.floating-page-toolbar {
		display: grid;
		grid-template-columns: minmax(min(var(--toolbar-leading-min), 100%), 1fr) auto;
		align-items: center;
		gap: var(--sp-3);
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
		flex-wrap: nowrap;
		gap: var(--sp-2);
		min-width: 0;
	}

	.floating-page-toolbar__leading {
		justify-content: flex-start;
	}

	.floating-page-toolbar__actions {
		justify-content: flex-end;
	}

	.floating-page-toolbar__overflow {
		display: none;
		justify-content: flex-end;
	}

	.floating-page-toolbar--has-overflow {
		grid-template-columns: minmax(min(var(--toolbar-leading-min), 100%), 1fr) auto auto;
	}
</style>
