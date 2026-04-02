<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { DropdownItem, SmartToolbarItem } from './SmartToolbar.types';
	import { computeVisibleItemCount } from './SmartToolbar.types';
	import HelpButton from './HelpButton.svelte';

	interface Props {
		items: SmartToolbarItem[];
		narrow?: boolean;
		title?: string;
		helpTopic?: string;
		children?: Snippet;
	}

	let { items, narrow = false, title, helpTopic, children }: Props = $props();

	let openDropdown = $state<string | null>(null);
	let visibleCount = $state(Number.MAX_SAFE_INTEGER);

	const OVERFLOW_KEY = '__overflow__';

	const overflowItems = $derived(items.filter((i) => i.type === 'overflow'));
	const collapsibleItems = $derived(items.filter((i) => i.type !== 'overflow'));
	const visibleItems = $derived(narrow ? [] : collapsibleItems.slice(0, visibleCount));
	const hiddenItems = $derived(narrow ? collapsibleItems : collapsibleItems.slice(visibleCount));
	const hasOverflowMenu = $derived(overflowItems.length > 0 || hiddenItems.length > 0);

	let rootEl: HTMLElement | undefined = $state();
	let toolbarEl: HTMLElement | undefined = $state();
	let measureEl: HTMLElement | undefined = $state();
	let titleEl: HTMLElement | undefined = $state();
	let childrenEl: HTMLElement | undefined = $state();

	function toggleDropdown(label: string) {
		if (label !== OVERFLOW_KEY) {
			const item = collapsibleItems.find((candidate) => (candidate.id ?? candidate.label) === label);
			if (item?.disabled) return;
		}
		openDropdown = openDropdown === label ? null : label;
	}

	function closeDropdown() {
		openDropdown = null;
	}

	function measureLayout() {
		if (narrow) {
			visibleCount = 0;
			return;
		}

		if (!rootEl || !toolbarEl || !measureEl) {
			visibleCount = collapsibleItems.length;
			return;
		}

		const rootWidth = rootEl.getBoundingClientRect().width || rootEl.clientWidth;
		const rootStyles = getComputedStyle(rootEl);
		const shellGapWidth = Number.parseFloat(rootStyles.columnGap || rootStyles.gap || '0') || 0;
		const reservedSections = [titleEl, childrenEl].filter(Boolean);
		const reservedWidth = reservedSections.reduce(
			(sum, element) =>
				sum + ((element as HTMLElement).getBoundingClientRect().width || (element as HTMLElement).clientWidth),
			0
		);
		const reservedGapWidth = reservedSections.length > 0 ? shellGapWidth * reservedSections.length : 0;
		const containerWidth = Math.max(0, rootWidth - reservedWidth - reservedGapWidth);

		if (containerWidth <= 0) {
			visibleCount = 0;
			return;
		}

		const itemWidths = Array.from(measureEl.querySelectorAll<HTMLElement>('[data-measure-item]')).map(
			(element) => element.getBoundingClientRect().width
		);
		const overflowTrigger = measureEl.querySelector<HTMLElement>('[data-measure-overflow]');
		const styles = getComputedStyle(toolbarEl);
		const gapWidth = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;

		visibleCount = computeVisibleItemCount({
			containerWidth,
			itemWidths,
			overflowWidth: overflowTrigger?.getBoundingClientRect().width ?? 0,
			gapWidth,
			hasOverflowItems: overflowItems.length > 0
		});
	}

	$effect(() => {
		collapsibleItems.length;
		narrow;

		if (typeof window === 'undefined') return;

		const frame = window.requestAnimationFrame(() => {
			measureLayout();
		});

		return () => window.cancelAnimationFrame(frame);
	});

	$effect(() => {
		if (typeof window === 'undefined') return;

		function handleResize() {
			measureLayout();
		}

		window.addEventListener('resize', handleResize);
		window.addEventListener('orientationchange', handleResize);

		return () => {
			window.removeEventListener('resize', handleResize);
			window.removeEventListener('orientationchange', handleResize);
		};
	});

	$effect(() => {
		if (typeof ResizeObserver === 'undefined' || !rootEl || !toolbarEl) return;

		const observer = new ResizeObserver(() => {
			measureLayout();
		});

		observer.observe(rootEl);
		observer.observe(toolbarEl);
		if (measureEl) observer.observe(measureEl);
		if (titleEl) observer.observe(titleEl);
		if (childrenEl) observer.observe(childrenEl);

		return () => observer.disconnect();
	});

	$effect(() => {
		if (!openDropdown) return;

		function handleMouseDown(e: MouseEvent) {
			if (toolbarEl && !toolbarEl.contains(e.target as Node)) {
				closeDropdown();
			}
		}

		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === 'Escape') closeDropdown();
		}

		window.addEventListener('mousedown', handleMouseDown);
		window.addEventListener('keydown', handleKeyDown);

		return () => {
			window.removeEventListener('mousedown', handleMouseDown);
			window.removeEventListener('keydown', handleKeyDown);
		};
	});
</script>

{#snippet menuItem(item: DropdownItem)}
	{#if item.href}
		<a
			class="menu-item"
			role="menuitem"
			href={item.disabled ? undefined : item.href}
			aria-disabled={item.disabled || undefined}
			onclick={() => {
				if (!item.disabled) closeDropdown();
			}}
			>{#if item.active}<span class="check" aria-hidden="true">✓</span>{/if}{item.label}</a
		>
	{:else}
		<button
			class="menu-item"
			type="button"
			role="menuitem"
			disabled={item.disabled}
			onclick={() => {
				if (!item.disabled) {
					item.onclick?.();
					closeDropdown();
				}
			}}
			>{#if item.active}<span class="check" aria-hidden="true">✓</span>{/if}{item.label}</button
		>
	{/if}
{/snippet}

{#snippet toolbarControl(item: SmartToolbarItem)}
	{#if item.type === 'button'}
		<button
			class="toolbar-btn"
			class:active={item.active}
			type="button"
			disabled={item.disabled}
			aria-pressed={item.active === undefined ? undefined : item.active}
			onclick={item.onclick}
		>
			{item.label}
		</button>
	{:else if item.type === 'dropdown'}
		<div class="dropdown-wrapper">
			<button
				class="toolbar-btn dropdown-trigger"
				class:active={item.active}
				type="button"
				disabled={item.disabled}
				aria-haspopup="menu"
				aria-expanded={openDropdown === (item.id ?? item.label)}
				onclick={() => toggleDropdown(item.id ?? item.label)}
			>
				{item.label}
				<svg
					class="chevron"
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<polyline points="6 9 12 15 18 9" />
				</svg>
			</button>
			{#if openDropdown === (item.id ?? item.label)}
				<div class="dropdown-menu" role="menu">
					{#each item.items ?? [] as dropdownItem}
						{@render menuItem(dropdownItem)}
					{/each}
				</div>
			{/if}
		</div>
	{:else if item.type === 'icon-button'}
		{#if item.href && !item.disabled}
			<a class="toolbar-btn icon-btn" href={item.href} aria-label={item.label}>
				{#if item.icon}
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html item.icon}
				{/if}
			</a>
		{:else}
			<button
				class="toolbar-btn icon-btn"
				type="button"
				aria-label={item.label}
				disabled={item.disabled}
				onclick={item.onclick}
			>
				{#if item.icon}
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html item.icon}
				{/if}
			</button>
		{/if}
	{/if}
{/snippet}

<div
	class="smart-toolbar-shell"
	class:smart-toolbar-page={!!title}
	data-testid={title ? 'smart-toolbar-page' : undefined}
	bind:this={rootEl}
>
	{#if title}
		<div class="toolbar-title-area">
			<h2 class="toolbar-title" bind:this={titleEl}>
				{title}{#if helpTopic}<HelpButton topic={helpTopic} />{/if}
			</h2>
		</div>
	{/if}
	{#if children}
		<div class="toolbar-children" bind:this={childrenEl}>
			{@render children()}
		</div>
	{/if}
	<div class="smart-toolbar" data-testid="smart-toolbar" data-narrow={narrow || undefined} bind:this={toolbarEl}>
		{#each visibleItems as item}
			{@render toolbarControl(item)}
		{/each}

		{#if hasOverflowMenu}
			<div class="dropdown-wrapper">
				<button
					class="toolbar-btn more-btn"
					type="button"
					aria-label="More actions"
					aria-haspopup="menu"
					aria-expanded={openDropdown === OVERFLOW_KEY}
					onclick={() => toggleDropdown(OVERFLOW_KEY)}
				>
					<span>More</span>
					<svg
						class="chevron"
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<polyline points="6 9 12 15 18 9" />
					</svg>
				</button>
				{#if openDropdown === OVERFLOW_KEY}
					<div class="dropdown-menu" role="menu">
						{#each hiddenItems as item}
							{#if item.type === 'button' || item.type === 'icon-button'}
								{@render menuItem({
									label: item.label,
									href: item.href,
									onclick: item.onclick,
									disabled: item.disabled,
									active: item.active
								})}
							{:else if item.type === 'dropdown'}
								<div class="group-header">{item.label}</div>
								{#each item.items ?? [] as dropdownItem}
									{@render menuItem({
										...dropdownItem,
										disabled: item.disabled || dropdownItem.disabled
									})}
								{/each}
							{/if}
						{/each}
						{#if hiddenItems.length > 0 && overflowItems.length > 0}
							<div class="divider" role="separator"></div>
						{/if}
						{#each overflowItems as item}
							{@render menuItem({
								label: item.label,
								href: item.href,
								onclick: item.onclick,
								disabled: item.disabled,
								active: item.active
							})}
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<div class="measure-strip" aria-hidden="true" bind:this={measureEl}>
		{#each collapsibleItems as item}
			<div data-measure-item>
				{@render toolbarControl(item)}
			</div>
		{/each}
		{#if collapsibleItems.length > 0 || overflowItems.length > 0}
			<div class="dropdown-wrapper" data-measure-overflow>
				<button class="toolbar-btn more-btn" type="button">
					<span>More</span>
					<svg
						class="chevron"
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<polyline points="6 9 12 15 18 9" />
					</svg>
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.smart-toolbar-shell {
		position: relative;
		display: flex;
		align-items: flex-end;
		flex-wrap: wrap;
		gap: var(--sp-3);
	}

	.smart-toolbar-page {
		padding: var(--sp-5) var(--sp-6);
		background: var(--toolbar-bg);
		border-bottom: 1px solid var(--toolbar-border);
	}

	.toolbar-title-area {
		flex: 0 1 auto;
		min-width: 0;
	}

	.toolbar-title {
		font-family: var(--font-display);
		font-size: clamp(1.75rem, 1.4rem + 1vw, 2.4rem);
		font-weight: var(--font-weight-display);
		letter-spacing: 0.05em;
		line-height: var(--line-height-tight);
		text-transform: uppercase;
		color: var(--text-primary);
		margin: 0;
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.toolbar-children {
		display: flex;
		flex: 0 1 auto;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.smart-toolbar {
		display: flex;
		flex: 0 1 auto;
		align-items: center;
		justify-content: flex-end;
		gap: var(--sp-2);
		margin-left: auto;
		min-width: 0;
		flex-wrap: wrap;
	}

	.toolbar-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-1);
		min-height: 34px;
		padding: 7px 12px;
		background: transparent;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
		white-space: nowrap;
	}

	.toolbar-btn:hover:not(:disabled) {
		background: var(--surface-subtle);
		border-color: var(--ink-35);
		color: var(--text-primary);
	}

	.toolbar-btn.active {
		border-color: var(--amber);
		background: var(--amber-light);
		color: var(--amber-dark);
	}

	.toolbar-btn:disabled {
		color: var(--text-tertiary);
		cursor: default;
	}

	.toolbar-btn:focus-visible {
		outline: var(--focus-outline);
		outline-offset: var(--focus-outline-offset);
		box-shadow: var(--focus-ring);
	}

	.icon-btn {
		width: 34px;
		padding: 0;
		justify-content: center;
	}

	.chevron {
		flex-shrink: 0;
	}

	.dropdown-wrapper {
		position: relative;
	}

	.dropdown-menu {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		z-index: 1000;
		min-width: 180px;
		background: var(--surface-panel);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-md);
		padding: 4px 0;
	}

	.menu-item {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 8px 12px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-primary);
		background: none;
		border: none;
		text-align: left;
		cursor: pointer;
		text-decoration: none;
		transition: background var(--transition-fast);
	}

	.menu-item:hover:not([disabled]):not([aria-disabled='true']) {
		background: var(--surface-subtle);
	}

	.menu-item[disabled],
	.menu-item[aria-disabled='true'] {
		color: var(--text-tertiary);
		cursor: default;
		pointer-events: none;
	}

	.check {
		margin-right: 6px;
		color: var(--amber);
		font-size: var(--text-xs);
	}

	.group-header {
		padding: 6px 12px 2px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--text-tertiary);
	}

	.divider {
		height: 1px;
		background: var(--divider-color);
		margin: 4px 0;
	}

	@media (max-width: 640px) {
		.smart-toolbar-page {
			padding: var(--sp-4);
		}

		.smart-toolbar {
			width: 100%;
			margin-left: 0;
		}
	}

	.measure-strip {
		position: absolute;
		left: -9999px;
		top: 0;
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		visibility: hidden;
		pointer-events: none;
		white-space: nowrap;
	}
</style>
