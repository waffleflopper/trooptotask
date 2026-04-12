<script lang="ts">
	import { dndzone, SHADOW_ITEM_MARKER_PROPERTY_NAME } from 'svelte-dnd-action';
	import type { DashboardContext } from '../contexts/DashboardContext.svelte';
	import type { WidgetInstance, ColSpan } from '../dashboard.types';
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

	// Local copy during drag for smooth animation
	let localWidgets = $state<WidgetInstance[]>([...dashboardLayout.widgets]);
	let isDragging = $state(false);

	$effect(() => {
		if (!isDragging) {
			localWidgets = [...widgets];
		}
	});

	function handleConsider(e: CustomEvent<{ items: WidgetInstance[] }>) {
		isDragging = true;
		localWidgets = e.detail.items;
	}

	function handleFinalize(e: CustomEvent<{ items: WidgetInstance[] }>) {
		isDragging = false;
		const clean = e.detail.items.filter(
			(w) => !(SHADOW_ITEM_MARKER_PROPERTY_NAME in (w as unknown as Record<string, unknown>))
		);
		dashboardLayout.setWidgets(clean);
	}

	function removeWidget(id: string) {
		dashboardLayout.removeWidget(id);
	}

	function setColSpan(id: string, span: ColSpan) {
		dashboardLayout.updateWidgetColSpan(id, span);
	}

	const SPAN_LABELS: Record<ColSpan, string> = { 1: '1 col', 2: '2 col', 3: 'Full width' };
</script>

<!--
	Single flat DnD zone. CSS grid places items left-to-right, top-to-bottom.
	grid-column: span N ensures widgets ACTUALLY occupy N columns so adjacent
	widgets flow around them correctly — no overlap, no visual trickery.
	Full-width (span 3) widgets use 1 / -1 so they always start a fresh row
	and push all content below them.
-->
<div
	class="widget-grid"
	class:widget-grid--configure={configureMode}
	use:dndzone={{
		items: localWidgets,
		flipDurationMs: 180,
		dragDisabled: !configureMode,
		dropTargetStyle: {}
	}}
	onconsider={handleConsider}
	onfinalize={handleFinalize}
>
	{#each localWidgets as widget (widget.id)}
		{@const colSpan = (widget.colSpan ?? 1) as ColSpan}
		<div
			class="widget-slot"
			class:widget-slot--configure={configureMode}
			class:widget-slot--span2={colSpan === 2}
			class:widget-slot--span3={colSpan === 3}
		>
			{#if configureMode}
				<div class="widget-controls">
					<!-- Drag handle -->
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

					<!-- Span controls -->
					<div class="widget-span-picker" role="group" aria-label="Column span">
						{#each [1, 2, 3] as ColSpan[] as span (span)}
							<button
								class="span-btn"
								class:span-btn--active={colSpan === span}
								onclick={() => setColSpan(widget.id, span)}
								aria-pressed={colSpan === span}
								title={SPAN_LABELS[span]}
							>
								{SPAN_LABELS[span]}
							</button>
						{/each}
					</div>

					<!-- Remove -->
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
	/* ------------------------------------------------------------------ */
	/* Flat 3-column grid.                                                  */
	/* Items fill left → right, then wrap to next row.                     */
	/* grid-column: span N means the widget ACTUALLY takes up N columns,   */
	/* so every other widget correctly flows around it.                     */
	/* Full-width (1 / -1) always starts and ends on a row boundary.       */
	/* ------------------------------------------------------------------ */

	.widget-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		grid-auto-flow: row;
		gap: var(--sp-3);
		align-items: start;
	}

	/* Default: 1 column wide */
	.widget-slot {
		grid-column: span 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 120px;
	}

	/* 2-column span */
	.widget-slot--span2 {
		grid-column: span 2;
	}

	/* Full-width: always occupies an entire row, pushes content below */
	.widget-slot--span3 {
		grid-column: 1 / -1;
	}

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

	.widget-span-picker {
		display: flex;
		gap: 2px;
		flex: 1;
	}

	.span-btn {
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

	.span-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		color: var(--color-chrome-text);
	}

	.span-btn--active {
		background: var(--amber);
		border-color: var(--amber);
		color: var(--accent-contrast);
	}

	.span-btn:focus-visible {
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

	/* Tablet: 2 columns; span-3 still goes full-width */
	@media (max-width: 900px) {
		.widget-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.widget-slot--span2,
		.widget-slot--span3 {
			grid-column: 1 / -1;
		}
	}

	/* Mobile: single column */
	@media (max-width: 600px) {
		.widget-grid {
			grid-template-columns: 1fr;
		}

		.widget-slot,
		.widget-slot--span2,
		.widget-slot--span3 {
			grid-column: span 1;
		}
	}
</style>
