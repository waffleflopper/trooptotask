<script lang="ts">
	import { onMount } from 'svelte';
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import SkeletonBlock from '$lib/components/ui/SkeletonBlock.svelte';
	import DashboardGrid from './DashboardGrid.svelte';
	import DashboardWidgetPicker from './DashboardWidgetPicker.svelte';
	import { dashboardLayout } from '../stores/dashboardLayout.svelte';
	import type { DashboardContext } from '../contexts/DashboardContext.svelte';

	let { ctx }: { ctx: DashboardContext } = $props();

	const configureMode = $derived(dashboardLayout.configureMode);
	const showFirstRun = $derived(dashboardLayout.isFirstRun && !dashboardLayout.firstRunDismissed);

	// Picker open/close is independent of configure mode —
	// closing the drawer does NOT exit configure mode.
	let pickerOpen = $state(false);

	onMount(() => {
		dashboardLayout.init(ctx.data.orgId);
	});

	function enterConfigure() {
		dashboardLayout.enterConfigureMode();
		pickerOpen = true;
	}

	function exitConfigure() {
		dashboardLayout.exitConfigureMode();
		pickerOpen = false;
	}
</script>

<svelte:head>
	<title>{ctx.data.orgName} — Dashboard — Troop to Task</title>
</svelte:head>

<div class="dashboard-page" class:dashboard-page--picker-open={pickerOpen}>
	<PageToolbar title={ctx.data.orgName} subtitle={ctx.todayDisplay}>
		{#snippet leading()}
			<div class="toolbar-leading">
				<div class="toolbar-org">
					<span class="toolbar-org-kicker">Dashboard</span>
					<h1 class="toolbar-org-name">{ctx.data.orgName}</h1>
				</div>
				<span class="toolbar-date">{ctx.todayDisplay}</span>
			</div>
		{/snippet}

		{#if configureMode}
			<button class="btn btn-amber btn-sm" onclick={exitConfigure}>Done</button>
		{:else}
			<button class="btn btn-secondary btn-sm" onclick={enterConfigure}>Customize</button>
		{/if}
	</PageToolbar>

	{#if configureMode}
		<div class="configure-banner" role="status" aria-live="polite">
			<span class="configure-banner-icon" aria-hidden="true">
				<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
					<circle cx="7" cy="7" r="2" />
					<path
						d="M7 1v1M7 12v1M1 7h1M12 7h1M2.93 2.93l.71.71M10.36 10.36l.71.71M2.93 11.07l.71-.71M10.36 3.64l.71-.71"
						stroke-linecap="round"
					/>
				</svg>
			</span>
			<span class="configure-banner-text">
				<strong>Configure mode.</strong> Drag to reorder. Use size controls to resize. Hit Done when finished.
			</span>
			<button
				class="configure-banner-add"
				onclick={() => (pickerOpen = !pickerOpen)}
				aria-expanded={pickerOpen}
				aria-label={pickerOpen ? 'Close widget panel' : 'Add widgets'}
			>
				{#if pickerOpen}
					<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
						<path d="M9 3L3 9M3 3l6 6" stroke-linecap="round" />
					</svg>
					Hide panel
				{:else}
					<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
						<path d="M6 2v8M2 6h8" stroke-linecap="round" />
					</svg>
					Add widgets
				{/if}
			</button>
		</div>
	{/if}

	{#if showFirstRun}
		<div class="first-run-callout" role="status">
			<div class="first-run-copy">
				<span class="first-run-title">Your dashboard, your layout.</span>
				<span class="first-run-desc">
					This is your default view. Hit <strong>Customize</strong> to rearrange widgets, resize them, or add new ones. Your
					layout saves automatically.
				</span>
			</div>
			<button class="first-run-dismiss" onclick={() => dashboardLayout.dismissFirstRun()} aria-label="Dismiss">
				<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
					<path d="M9 3L3 9M3 3l6 6" stroke-linecap="round" />
				</svg>
			</button>
		</div>
	{/if}

	<main class="dashboard-canvas page-scroll">
		{#if ctx.isHydrating || dashboardLayout.loading}
			<div class="dashboard-skeleton" aria-busy="true" aria-live="polite" role="status">
				<div class="skeleton-row skeleton-row--3">
					<SkeletonBlock height="160px" />
					<SkeletonBlock height="160px" />
					<SkeletonBlock height="160px" />
				</div>
				<div class="skeleton-row skeleton-row--2">
					<SkeletonBlock height="220px" />
					<SkeletonBlock height="220px" />
				</div>
				<div class="skeleton-row skeleton-row--1">
					<SkeletonBlock height="180px" />
				</div>
			</div>
		{:else if dashboardLayout.widgets.length === 0}
			<div class="dashboard-empty">
				<p class="empty-message">No widgets on your dashboard.</p>
				<button class="btn btn-amber" onclick={enterConfigure}>Add widgets</button>
			</div>
		{:else}
			<DashboardGrid {ctx} />
		{/if}
	</main>
</div>

<!-- Widget picker — independent of configure mode, toggled by banner button -->
<DashboardWidgetPicker {ctx} open={pickerOpen} onClose={() => (pickerOpen = false)} />

<style>
	.dashboard-page {
		display: flex;
		flex-direction: column;
		height: 100%;
		/* Shift canvas left to make room for widget picker when open */
		transition: padding-right 240ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	.dashboard-page--picker-open {
		padding-right: 300px;
	}

	/* Configure mode announcement banner */
	.configure-banner {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-4);
		background: var(--color-chrome);
		color: var(--color-chrome-text);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		flex-shrink: 0;
	}

	.configure-banner-icon {
		display: flex;
		align-items: center;
		color: var(--amber);
		flex-shrink: 0;
	}

	.configure-banner-icon svg {
		width: 14px;
		height: 14px;
	}

	.configure-banner-text {
		flex: 1;
	}

	.configure-banner-add {
		display: flex;
		align-items: center;
		gap: 5px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: var(--sp-1) var(--sp-2);
		border: 1px solid var(--color-chrome-border);
		background: transparent;
		color: var(--color-chrome-text-muted);
		cursor: pointer;
		border-radius: var(--radius-sm);
		flex-shrink: 0;
		transition:
			background var(--transition-fast),
			color var(--transition-fast),
			border-color var(--transition-fast);
	}

	.configure-banner-add:hover {
		background: rgba(255, 255, 255, 0.08);
		color: var(--color-chrome-text);
		border-color: var(--amber);
	}

	.configure-banner-add:focus-visible {
		outline: var(--focus-outline);
		outline-offset: 1px;
	}

	.configure-banner-add svg {
		width: 12px;
		height: 12px;
	}

	/* First-run callout */
	.first-run-callout {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-3) var(--sp-4);
		background: var(--amber-light);
		border-bottom: 1px solid color-mix(in srgb, var(--amber) 30%, transparent);
		flex-shrink: 0;
	}

	.first-run-copy {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.first-run-title {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--amber-dark);
	}

	.first-run-desc {
		font-family: var(--font-body);
		font-size: var(--text-sm);
		color: var(--ink-60);
		line-height: 1.5;
	}

	.first-run-dismiss {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		background: transparent;
		color: var(--ink-35);
		cursor: pointer;
		border-radius: var(--radius-sm);
		padding: 0;
		flex-shrink: 0;
		transition:
			color var(--transition-fast),
			background var(--transition-fast);
	}

	.first-run-dismiss:hover {
		color: var(--ink);
		background: color-mix(in srgb, var(--amber) 15%, transparent);
	}

	.first-run-dismiss:focus-visible {
		outline: var(--focus-outline);
		outline-offset: var(--focus-outline-offset);
	}

	.first-run-dismiss svg {
		width: 12px;
		height: 12px;
	}

	/* Scrollable canvas */
	.dashboard-canvas {
		flex: 1;
		overflow-y: auto;
		padding: var(--sp-4);
	}

	/* Loading skeleton */
	.dashboard-skeleton {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.skeleton-row {
		display: grid;
		gap: var(--sp-3);
	}

	.skeleton-row--1 {
		grid-template-columns: 1fr;
	}
	.skeleton-row--2 {
		grid-template-columns: 1fr 1fr;
	}
	.skeleton-row--3 {
		grid-template-columns: 1fr 1fr 1fr;
	}

	/* Empty state */
	.dashboard-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-4);
		padding: var(--sp-16) var(--sp-4);
	}

	.empty-message {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--ink-35);
		margin: 0;
	}

	/* Toolbar leading area */
	.toolbar-leading {
		display: flex;
		align-items: center;
		gap: var(--sp-4);
	}

	.toolbar-org {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.toolbar-org-kicker {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--ink-35);
		line-height: 1;
	}

	.toolbar-org-name {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: var(--font-weight-display);
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--ink);
		margin: 0;
		line-height: 1.1;
	}

	.toolbar-date {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-35);
		padding-left: var(--sp-4);
		border-left: var(--border-thin);
	}

	/* Responsive: collapse picker padding on mobile */
	@media (max-width: 600px) {
		.dashboard-page--picker-open {
			padding-right: 0;
		}

		.skeleton-row--3 {
			grid-template-columns: 1fr;
		}

		.skeleton-row--2 {
			grid-template-columns: 1fr;
		}

		.toolbar-date {
			display: none;
		}
	}
</style>
