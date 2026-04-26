<script lang="ts">
	import { onMount, tick } from 'svelte';
	import ToolbarOverflowMenu from './ToolbarOverflowMenu.svelte';
	import type { OverflowItem } from './OverflowMenu.types';
	import type { ProgressiveToolbarAction } from './ProgressiveToolbarActions.types';
	import { computeProgressiveVisibleCount } from './ProgressiveToolbarActions.types';

	interface Props {
		items: ProgressiveToolbarAction[];
		overflowAriaLabel: string;
		overflowLabel?: string;
		overflowIconOnly?: boolean;
	}

	let { items, overflowAriaLabel, overflowLabel = 'More', overflowIconOnly = false }: Props = $props();

	let hostEl: HTMLElement | undefined = $state();
	let measureEl: HTMLElement | undefined = $state();
	let visibleCount = $state(Number.MAX_SAFE_INTEGER);

	const visibleItems = $derived(items.slice(Math.max(0, items.length - visibleCount)));
	const hiddenItems = $derived(items.slice(0, Math.max(0, items.length - visibleCount)));
	const overflowItems = $derived(
		hiddenItems.map<OverflowItem>((item) => ({
			label: item.label,
			href: item.href,
			onclick: item.onclick,
			disabled: item.disabled
		}))
	);

	function actionKey(item: ProgressiveToolbarAction): string {
		return item.id;
	}

	function findToolbarMetrics() {
		const toolbarEl = hostEl?.closest<HTMLElement>('[data-floating-page-toolbar]');
		const leadingEl = toolbarEl?.querySelector<HTMLElement>('.floating-page-toolbar__leading');

		if (!toolbarEl || !leadingEl) {
			return null;
		}

		const toolbarRect = toolbarEl.getBoundingClientRect();
		const leadingRect = leadingEl.getBoundingClientRect();
		const styles = getComputedStyle(toolbarEl);
		const paddingInline = (Number.parseFloat(styles.paddingLeft) || 0) + (Number.parseFloat(styles.paddingRight) || 0);
		const gapWidth = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;

		return {
			availableWidth: Math.max(0, toolbarRect.width - paddingInline - leadingRect.width - gapWidth),
			hasMeasuredWidth: toolbarRect.width > 0 || leadingRect.width > 0,
			toolbarEl,
			leadingEl
		};
	}

	function measureLayout() {
		if (!hostEl || !measureEl) {
			visibleCount = items.length;
			return;
		}

		const metrics = findToolbarMetrics();
		if (!metrics || !metrics.hasMeasuredWidth) {
			visibleCount = items.length;
			return;
		}

		const itemWidths = Array.from(measureEl.querySelectorAll<HTMLElement>('[data-measure-action]')).map(
			(element) => element.getBoundingClientRect().width || element.clientWidth
		);
		const overflowTrigger = measureEl.querySelector<HTMLElement>('[data-measure-overflow]');
		const styles = getComputedStyle(hostEl);
		const gapWidth = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
		const nextVisibleCount = computeProgressiveVisibleCount({
			containerWidth: metrics.availableWidth,
			itemWidths,
			overflowWidth: overflowTrigger?.getBoundingClientRect().width || overflowTrigger?.clientWidth || 0,
			gapWidth
		});

		visibleCount = Math.min(items.length, nextVisibleCount);
	}

	$effect(() => {
		items.length;

		if (typeof window === 'undefined') return;

		const frame = window.requestAnimationFrame(() => {
			measureLayout();
		});

		return () => window.cancelAnimationFrame(frame);
	});

	onMount(() => {
		if (typeof window === 'undefined') return;

		const toolbarMetrics = findToolbarMetrics();
		const observed = [hostEl, measureEl, toolbarMetrics?.toolbarEl, toolbarMetrics?.leadingEl].filter(
			Boolean
		) as HTMLElement[];
		const resizeObserver =
			typeof ResizeObserver === 'undefined'
				? null
				: new ResizeObserver(() => {
						measureLayout();
					});

		resizeObserver?.observe(hostEl!);
		for (const element of observed) {
			resizeObserver?.observe(element);
		}

		function handleResize() {
			measureLayout();
		}

		window.addEventListener('resize', handleResize);
		window.addEventListener('orientationchange', handleResize);

		tick().then(measureLayout);

		return () => {
			resizeObserver?.disconnect();
			window.removeEventListener('resize', handleResize);
			window.removeEventListener('orientationchange', handleResize);
		};
	});
</script>

<div class="progressive-toolbar-actions" bind:this={hostEl}>
	{#each visibleItems as item (actionKey(item))}
		{#if item.href}
			<a
				class={item.className ?? 'btn btn-sm'}
				class:disabled={item.disabled}
				href={item.disabled ? undefined : item.href}>{item.label}</a
			>
		{:else}
			<button class={item.className ?? 'btn btn-sm'} type="button" onclick={item.onclick} disabled={item.disabled}>
				{item.label}
			</button>
		{/if}
	{/each}

	{#if overflowItems.length > 0}
		<ToolbarOverflowMenu
			ariaLabel={overflowAriaLabel}
			label={overflowLabel}
			iconOnly={overflowIconOnly}
			items={overflowItems}
		/>
	{/if}

	<div class="progressive-toolbar-actions__measure" aria-hidden="true" bind:this={measureEl}>
		{#each items as item (actionKey(item))}
			{#if item.href}
				<a class={item.className ?? 'btn btn-sm'} data-measure-action href={item.href}>{item.label}</a>
			{:else}
				<button class={item.className ?? 'btn btn-sm'} type="button" data-measure-action>
					{item.label}
				</button>
			{/if}
		{/each}
		<div data-measure-overflow>
			<ToolbarOverflowMenu ariaLabel={overflowAriaLabel} label={overflowLabel} iconOnly={overflowIconOnly} items={[]} />
		</div>
	</div>
</div>

<style>
	.progressive-toolbar-actions {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		flex-wrap: nowrap;
		gap: var(--sp-2);
		min-width: 0;
	}

	.progressive-toolbar-actions__measure {
		position: absolute;
		inset: auto 0 0 auto;
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		visibility: hidden;
		pointer-events: none;
		white-space: nowrap;
	}
</style>
