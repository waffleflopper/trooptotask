<script lang="ts">
	import type { DashboardContext } from '../contexts/DashboardContext.svelte';
	import type { WidgetMeta } from '../dashboard.types';
	import { isDashboardWidgetAllowed, WIDGET_CATALOG } from '../dashboard.types';
	import { dashboardLayout } from '../stores/dashboardLayout.svelte';

	interface Props {
		ctx: DashboardContext;
		open: boolean;
		onClose: () => void;
	}

	let { ctx, open, onClose }: Props = $props();

	// Filter widget catalog by user permissions
	const allowedWidgets = $derived(
		WIDGET_CATALOG.filter((widget) => isDashboardWidgetAllowed(widget.id, ctx.data.permissions))
	);

	const activeWidgetIds = $derived(dashboardLayout.activeWidgetIds);

	function addWidget(w: WidgetMeta) {
		dashboardLayout.addWidget(w.id, w.defaultSize, {});
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

<aside
	class="widget-picker"
	class:widget-picker--open={open}
	aria-label="Add widgets"
	aria-hidden={!open}
	inert={!open}
>
	<div class="picker-header">
		<h2 class="picker-title">Add Widgets</h2>
		<button class="picker-close" onclick={onClose} aria-label="Close widget picker">
			<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
				<path d="M12 4L4 12M4 4l8 8" stroke-linecap="round" />
			</svg>
		</button>
	</div>

	<div class="picker-body">
		<p class="picker-hint">Click to add a widget. Drag to reorder them on the canvas.</p>

		<div class="picker-list" role="list">
			{#each allowedWidgets as w (w.id)}
				{@const isActive = activeWidgetIds.has(w.id)}
				<div
					class="picker-item"
					class:picker-item--active={isActive}
					class:picker-item--placeholder={w.placeholder}
					role="listitem"
				>
					<div class="picker-item-copy">
						<span class="picker-item-label">
							{w.label}
							{#if w.placeholder}
								<span class="picker-item-planned">Planned</span>
							{/if}
						</span>
						<span class="picker-item-desc">{w.description}</span>
					</div>
					{#if isActive}
						<span class="picker-item-added" aria-label="Already on dashboard">
							<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
								<path d="M2 6l3 3 5-5" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
							Added
						</span>
					{:else}
						<button
							class="picker-add-btn"
							onclick={() => addWidget(w)}
							aria-label="Add {w.label}"
							disabled={w.placeholder}
						>
							<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
								<path d="M6 2v8M2 6h8" stroke-linecap="round" />
							</svg>
							Add
						</button>
					{/if}
				</div>
			{/each}
		</div>

		<div class="picker-reset">
			<button class="btn btn-secondary btn-sm" onclick={() => dashboardLayout.resetToDefault(ctx.data.permissions)}>
				Reset to default layout
			</button>
		</div>
	</div>
</aside>

<style>
	.widget-picker {
		position: fixed;
		right: 0;
		top: 0;
		bottom: 0;
		width: 300px;
		background: var(--paper);
		border-left: var(--border-thin);
		z-index: var(--z-sticky);
		display: flex;
		flex-direction: column;
		transform: translateX(100%);
		transition: transform 240ms cubic-bezier(0.16, 1, 0.3, 1);
		overflow: hidden;
	}

	.widget-picker--open {
		transform: translateX(0);
	}

	.picker-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--sp-3) var(--sp-4);
		border-bottom: var(--border-thin);
		flex-shrink: 0;
	}

	.picker-title {
		font-family: var(--font-display);
		font-size: var(--text-lg);
		font-weight: var(--font-weight-display);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--ink);
		margin: 0;
	}

	.picker-close {
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
		transition:
			color var(--transition-fast),
			background var(--transition-fast);
	}

	.picker-close:hover {
		color: var(--ink);
		background: var(--ink-06);
	}

	.picker-close:focus-visible {
		outline: var(--focus-outline);
		outline-offset: var(--focus-outline-offset);
	}

	.picker-close svg {
		width: 14px;
		height: 14px;
	}

	.picker-body {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.picker-hint {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-35);
		padding: var(--sp-3) var(--sp-4);
		border-bottom: var(--border-rule);
		margin: 0;
	}

	.picker-list {
		display: flex;
		flex-direction: column;
		flex: 1;
	}

	.picker-item {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-3) var(--sp-4);
		border-bottom: var(--border-rule);
		transition: background var(--transition-fast);
	}

	.picker-item--placeholder {
		opacity: 0.6;
	}

	.picker-item-copy {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}

	.picker-item-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink);
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.picker-item-planned {
		font-size: 9px;
		font-weight: var(--font-weight-regular);
		color: var(--ink-35);
		border: 1px solid var(--ink-15);
		border-radius: var(--radius-sm);
		padding: 1px 4px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.picker-item-desc {
		font-family: var(--font-body);
		font-size: var(--text-sm);
		color: var(--ink-60);
		line-height: 1.4;
	}

	.picker-item-added {
		display: flex;
		align-items: center;
		gap: 4px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--success);
		flex-shrink: 0;
	}

	.picker-item-added svg {
		width: 12px;
		height: 12px;
	}

	.picker-add-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: var(--sp-1) var(--sp-2);
		border: var(--border-thin);
		background: transparent;
		color: var(--ink-60);
		cursor: pointer;
		border-radius: var(--radius-sm);
		flex-shrink: 0;
		transition:
			background var(--transition-fast),
			color var(--transition-fast),
			border-color var(--transition-fast);
	}

	.picker-add-btn:hover:not(:disabled) {
		background: var(--amber-light);
		border-color: var(--amber);
		color: var(--amber-dark);
	}

	.picker-add-btn:focus-visible {
		outline: var(--focus-outline);
		outline-offset: var(--focus-outline-offset);
	}

	.picker-add-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.picker-add-btn svg {
		width: 12px;
		height: 12px;
	}

	.picker-reset {
		padding: var(--sp-4);
		border-top: var(--border-thin);
		flex-shrink: 0;
	}

	@media (max-width: 600px) {
		.widget-picker {
			width: 100%;
		}
	}
</style>
