<script lang="ts">
	import WidgetShell from './WidgetShell.svelte';
	import type { DashboardContext } from '../../contexts/DashboardContext.svelte';
	import type { WidgetInstanceConfig, QuickStatMetricId } from '../../dashboard.types';
	import { QUICK_STAT_METRICS } from '../../dashboard.types';
	import { dashboardLayout } from '../../stores/dashboardLayout.svelte';

	interface Props {
		ctx: DashboardContext;
		widgetId: string;
		config: WidgetInstanceConfig;
		configureMode: boolean;
	}

	let { ctx, widgetId, config, configureMode }: Props = $props();

	let configOpen = $state(false);

	const DEFAULT_METRICS: QuickStatMetricId[] = ['present-strength', 'training-currency', 'evaluations-overdue'];
	const metrics = $derived<QuickStatMetricId[]>(config.metrics ?? DEFAULT_METRICS);

	function toggleMetric(id: QuickStatMetricId) {
		const current = [...metrics];
		const idx = current.indexOf(id);
		if (idx >= 0) {
			if (current.length <= 1) return; // keep at least one
			current.splice(idx, 1);
		} else {
			if (current.length >= 4) return; // cap at 4
			current.push(id);
		}
		dashboardLayout.updateWidgetConfig(widgetId, { metrics: current });
	}
</script>

<WidgetShell label="Quick Stats" {configureMode} {configOpen} onConfigToggle={() => (configOpen = !configOpen)}>
	{#snippet config()}
		<div class="cfg-section">
			<p class="cfg-note">Choose 1–4 metrics to display.</p>
			<div class="cfg-metric-list">
				{#each QUICK_STAT_METRICS as m (m.id)}
					<label class="cfg-metric-row" class:cfg-metric-row--active={metrics.includes(m.id)}>
						<input type="checkbox" checked={metrics.includes(m.id)} onchange={() => toggleMetric(m.id)} />
						<span class="cfg-metric-name">{m.label}</span>
						<span class="cfg-metric-desc">{m.description}</span>
					</label>
				{/each}
			</div>
		</div>
	{/snippet}

	<div class="qs-grid" style="--qs-count: {metrics.length}">
		{#each metrics as metricId (metricId)}
			{@const meta = QUICK_STAT_METRICS.find((m) => m.id === metricId)}
			{@const value = ctx.quickStatValue(metricId)}
			{@const unit = ctx.quickStatUnit(metricId)}
			{@const isAlert =
				(metricId === 'evaluations-overdue' && value > 0) ||
				(metricId === 'expired-training' && value > 0) ||
				(metricId === 'training-currency' && value < 80)}
			<div class="qs-tile" class:qs-tile--alert={isAlert}>
				<span class="qs-value" class:qs-value--alert={isAlert}>
					{value}{unit}
				</span>
				<span class="qs-label">{meta?.label ?? metricId}</span>
			</div>
		{/each}
	</div>
</WidgetShell>

<style>
	.qs-grid {
		display: grid;
		grid-template-columns: repeat(var(--qs-count, 3), 1fr);
		flex: 1;
	}

	@container (max-width: 280px) {
		.qs-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	.qs-tile {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--sp-1);
		padding: var(--sp-4) var(--sp-2);
		text-align: center;
	}

	.qs-tile + .qs-tile {
		border-left: var(--border-rule);
	}

	.qs-value {
		font-family: var(--font-display);
		font-size: var(--text-3xl);
		font-weight: var(--font-weight-display);
		line-height: 1;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}

	.qs-value--alert {
		color: var(--amber-dark);
	}

	:root[data-theme='dark'] .qs-value--alert {
		color: var(--amber);
	}

	.qs-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink-35);
		text-align: center;
		max-width: 80px;
		line-height: 1.3;
	}

	/* Config panel */
	.cfg-section {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.cfg-note {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-35);
		margin: 0;
	}

	.cfg-metric-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-height: 200px;
		overflow-y: auto;
	}

	.cfg-metric-row {
		display: grid;
		grid-template-columns: auto 1fr;
		grid-template-rows: auto auto;
		column-gap: var(--sp-2);
		row-gap: 1px;
		padding: 4px var(--sp-2);
		border-radius: var(--radius-sm);
		cursor: pointer;
		border: 1px solid transparent;
	}

	.cfg-metric-row input {
		grid-row: 1 / 3;
		align-self: center;
		margin: 0;
	}

	.cfg-metric-row--active {
		background: var(--amber-light);
		border-color: color-mix(in srgb, var(--amber) 20%, transparent);
	}

	.cfg-metric-name {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		color: var(--ink);
	}

	.cfg-metric-desc {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-35);
	}
</style>
