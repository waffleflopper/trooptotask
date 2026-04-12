<script lang="ts">
	import { dndzone, SHADOW_ITEM_MARKER_PROPERTY_NAME } from 'svelte-dnd-action';
	import type { DashboardContext } from '../contexts/DashboardContext.svelte';
	import type { WidgetInstance, WidgetSize } from '../dashboard.types';
	import { dashboardLayout } from '../stores/dashboardLayout.svelte';

	// Widget components
	import StrengthWidget from './widgets/StrengthWidget.svelte';
	import NonAvailableWidget from './widgets/NonAvailableWidget.svelte';
	import DutyRosterWidget from './widgets/DutyRosterWidget.svelte';
	import EvaluationPipelineWidget from './widgets/EvaluationPipelineWidget.svelte';
	import TrainingHealthWidget from './widgets/TrainingHealthWidget.svelte';
	import OnboardingStatusWidget from './widgets/OnboardingStatusWidget.svelte';
	import QuickStatsWidget from './widgets/QuickStatsWidget.svelte';
	import UpcomingLossesWidget from './widgets/UpcomingLossesWidget.svelte';
	import IctlWidget from './widgets/IctlWidget.svelte';

	interface Props {
		ctx: DashboardContext;
	}

	let { ctx }: Props = $props();

	const configureMode = $derived(dashboardLayout.configureMode);
	const widgets = $derived(dashboardLayout.widgets);

	const SIZES: WidgetSize[] = [3, 4, 6, 12];
	const SIZE_LABELS: Record<WidgetSize, string> = { 3: 'Narrow', 4: 'Standard', 6: 'Wide', 12: 'Full' };

	function handleConsider(e: CustomEvent<{ items: WidgetInstance[] }>) {
		dashboardLayout.widgets = e.detail.items;
	}

	function handleFinalize(e: CustomEvent<{ items: WidgetInstance[] }>) {
		dashboardLayout.setWidgets(
			e.detail.items.filter((w) => !w[SHADOW_ITEM_MARKER_PROPERTY_NAME as keyof WidgetInstance])
		);
	}

	function removeWidget(id: string) {
		dashboardLayout.removeWidget(id);
	}

	function setSize(id: string, size: WidgetSize) {
		dashboardLayout.updateWidgetSize(id, size);
	}
</script>

<div
	class="widget-grid"
	class:widget-grid--configure={configureMode}
	use:dndzone={{ items: widgets, flipDurationMs: 180, dragDisabled: !configureMode, dropTargetStyle: {} }}
	onconsider={handleConsider}
	onfinalize={handleFinalize}
>
	{#each widgets as widget (widget.id)}
		<div class="widget-slot" class:widget-slot--configure={configureMode} style="--widget-cols: {widget.size}">
			{#if configureMode}
				<!-- Configure-mode overlay controls -->
				<div class="widget-controls" aria-label="Widget controls">
					<div class="widget-drag-handle" aria-label="Drag to reorder" title="Drag to reorder">
						<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
							<circle cx="5" cy="4" r="1.2" />
							<circle cx="11" cy="4" r="1.2" />
							<circle cx="5" cy="8" r="1.2" />
							<circle cx="11" cy="8" r="1.2" />
							<circle cx="5" cy="12" r="1.2" />
							<circle cx="11" cy="12" r="1.2" />
						</svg>
					</div>

					<div class="widget-size-picker" role="group" aria-label="Widget size">
						{#each SIZES as size (size)}
							<button
								class="size-btn"
								class:size-btn--active={widget.size === size}
								onclick={() => setSize(widget.id, size)}
								title={SIZE_LABELS[size]}
								aria-pressed={widget.size === size}
								aria-label="{SIZE_LABELS[size]} width"
							>
								{SIZE_LABELS[size]}
							</button>
						{/each}
					</div>

					<button
						class="widget-remove-btn"
						onclick={() => removeWidget(widget.id)}
						aria-label="Remove widget"
						title="Remove"
					>
						<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
							<path d="M12 4L4 12M4 4l8 8" stroke-linecap="round" />
						</svg>
					</button>
				</div>
			{/if}

			<!-- Widget content -->
			{#if widget.widgetId === 'strength'}
				<StrengthWidget {ctx} widgetId={widget.id} config={widget.config} {configureMode} />
			{:else if widget.widgetId === 'non-available'}
				<NonAvailableWidget {ctx} config={widget.config} {configureMode} />
			{:else if widget.widgetId === 'duty'}
				<DutyRosterWidget {ctx} widgetId={widget.id} config={widget.config} {configureMode} />
			{:else if widget.widgetId === 'evaluations'}
				<EvaluationPipelineWidget {ctx} widgetId={widget.id} config={widget.config} {configureMode} />
			{:else if widget.widgetId === 'training'}
				<TrainingHealthWidget {ctx} widgetId={widget.id} config={widget.config} {configureMode} />
			{:else if widget.widgetId === 'onboarding'}
				<OnboardingStatusWidget {ctx} {configureMode} />
			{:else if widget.widgetId === 'quick-stats'}
				<QuickStatsWidget {ctx} widgetId={widget.id} config={widget.config} {configureMode} />
			{:else if widget.widgetId === 'upcoming-losses'}
				<UpcomingLossesWidget {configureMode} />
			{:else if widget.widgetId === 'ictl'}
				<IctlWidget {configureMode} />
			{/if}
		</div>
	{/each}
</div>

<style>
	.widget-grid {
		display: grid;
		grid-template-columns: repeat(12, 1fr);
		gap: var(--sp-3);
		align-items: start;
		/* Prevent layout shift from dnd ghost */
		padding: 1px;
	}

	.widget-slot {
		grid-column: span var(--widget-cols, 4);
		display: flex;
		flex-direction: column;
		position: relative;
		min-width: 0;
	}

	/* Configure mode: show controls above the widget */
	.widget-slot--configure {
		cursor: grab;
	}

	.widget-slot--configure:active {
		cursor: grabbing;
	}

	/* Configure controls bar */
	.widget-controls {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-1) var(--sp-2);
		background: var(--color-chrome);
		margin-bottom: 0;
		flex-shrink: 0;
	}

	.widget-drag-handle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		color: var(--color-chrome-text-muted);
		cursor: grab;
		flex-shrink: 0;
	}

	.widget-drag-handle:active {
		cursor: grabbing;
	}

	.widget-drag-handle svg {
		width: 14px;
		height: 14px;
	}

	.widget-size-picker {
		display: flex;
		gap: 2px;
		flex: 1;
	}

	.size-btn {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: 2px var(--sp-2);
		border: 1px solid var(--color-chrome-border);
		background: transparent;
		color: var(--color-chrome-text-muted);
		cursor: pointer;
		border-radius: var(--radius-sm);
		transition:
			background var(--transition-fast),
			color var(--transition-fast),
			border-color var(--transition-fast);
		white-space: nowrap;
	}

	.size-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		color: var(--color-chrome-text);
	}

	.size-btn--active {
		background: var(--amber);
		border-color: var(--amber);
		color: var(--accent-contrast);
	}

	.size-btn:focus-visible {
		outline: var(--focus-outline);
		outline-offset: 1px;
	}

	.widget-remove-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: none;
		background: transparent;
		color: var(--color-chrome-text-muted);
		cursor: pointer;
		border-radius: var(--radius-sm);
		padding: 0;
		flex-shrink: 0;
		transition:
			color var(--transition-fast),
			background var(--transition-fast);
	}

	.widget-remove-btn:hover {
		color: var(--danger);
		background: rgba(255, 255, 255, 0.08);
	}

	.widget-remove-btn:focus-visible {
		outline: var(--focus-outline);
		outline-offset: 1px;
	}

	.widget-remove-btn svg {
		width: 14px;
		height: 14px;
	}

	/* Tablet: collapse to 6-column grid, narrow widgets go full-width */
	@media (max-width: 900px) {
		.widget-grid {
			grid-template-columns: repeat(6, 1fr);
		}

		.widget-slot {
			/* Map 12-col spans to 6-col equivalents */
			grid-column: span min(var(--widget-cols, 4), 6);
		}
	}

	/* Mobile: single column */
	@media (max-width: 600px) {
		.widget-grid {
			grid-template-columns: 1fr;
		}

		.widget-slot {
			grid-column: span 1;
		}

		.widget-size-picker {
			display: none;
		}
	}
</style>
