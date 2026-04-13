<script lang="ts">
	import WidgetShell from './WidgetShell.svelte';
	import type { DashboardContext } from '../../contexts/DashboardContext.svelte';
	import type { WidgetInstanceConfig } from '../../dashboard.types';
	import { dashboardLayout } from '../../stores/dashboardLayout.svelte';

	interface Props {
		ctx: DashboardContext;
		widgetId: string;
		config: WidgetInstanceConfig;
		configureMode?: boolean;
	}

	let { ctx, widgetId, config, configureMode = false }: Props = $props();

	let configOpen = $state(false);
	const lookaheadDays = $derived(config.lookaheadDays ?? 60);
	const entries = $derived(ctx.ratingsDueSoon(lookaheadDays));
	const hasSignal = $derived(ctx.ratingStats.overdue > 0 || ctx.ratingStats['due-30'] > 0);

	const STATUS_LABELS: Record<string, string> = {
		overdue: 'OVERDUE',
		'due-30': 'DUE <30D',
		'due-60': 'DUE <60D'
	};

	const STATUS_COLORS: Record<string, string> = {
		overdue: 'var(--danger)',
		'due-30': 'var(--amber)',
		'due-60': 'var(--ink-35)'
	};
</script>

<WidgetShell
	label="Evaluation Pipeline"
	href="/org/{ctx.data.orgId}/leaders-book"
	signal={hasSignal}
	{configureMode}
	{configOpen}
	onConfigToggle={() => (configOpen = !configOpen)}
>
	{#snippet config()}
		<label class="cfg-row">
			<span>Lookahead window</span>
			<select
				class="cfg-select"
				value={lookaheadDays}
				onchange={(e) => dashboardLayout.updateWidgetConfig(widgetId, { lookaheadDays: Number(e.currentTarget.value) })}
			>
				<option value={30}>30 days</option>
				<option value={60}>60 days</option>
				<option value={90}>90 days</option>
			</select>
		</label>
	{/snippet}

	{#if ctx.ratingStats.overdue > 0 || ctx.ratingStats['due-30'] > 0 || ctx.ratingStats['due-60'] > 0}
		<div class="eval-summary">
			{#if ctx.ratingStats.overdue > 0}
				<div class="eval-stat eval-stat--overdue">
					<span class="eval-stat-count">{ctx.ratingStats.overdue}</span>
					<span class="eval-stat-label">Overdue</span>
				</div>
			{/if}
			{#if ctx.ratingStats['due-30'] > 0}
				<div class="eval-stat eval-stat--warn">
					<span class="eval-stat-count">{ctx.ratingStats['due-30']}</span>
					<span class="eval-stat-label">Due &lt;30d</span>
				</div>
			{/if}
			{#if ctx.ratingStats['due-60'] > 0}
				<div class="eval-stat">
					<span class="eval-stat-count">{ctx.ratingStats['due-60']}</span>
					<span class="eval-stat-label">Due &lt;60d</span>
				</div>
			{/if}
		</div>
	{/if}

	{#if entries.length === 0}
		<div class="widget-empty">
			<span>No evaluations due within {lookaheadDays} days.</span>
		</div>
	{:else}
		<div class="eval-list" role="list">
			{#each entries as entry (entry.id)}
				<div class="eval-row" role="listitem">
					<div class="eval-left">
						<span class="eval-name">{entry.personName}</span>
						{#if entry.evalType}
							<span class="eval-type">{entry.evalType}</span>
						{/if}
					</div>
					<div class="eval-right">
						<span class="eval-status" style="color: {STATUS_COLORS[entry.status]}">
							{STATUS_LABELS[entry.status] ?? entry.status}
						</span>
						<span class="eval-date">{ctx.formatShortDate(entry.ratingPeriodEnd)}</span>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</WidgetShell>

<style>
	.eval-summary {
		display: flex;
		gap: 0;
		border-bottom: var(--border-rule);
		flex-shrink: 0;
	}

	.eval-stat {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: var(--sp-3) var(--sp-2);
		gap: 2px;
	}

	.eval-stat + .eval-stat {
		border-left: var(--border-rule);
	}

	.eval-stat-count {
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		font-weight: var(--font-weight-display);
		line-height: 1;
		color: var(--ink-35);
		font-variant-numeric: tabular-nums;
	}

	.eval-stat--overdue .eval-stat-count {
		color: var(--danger);
	}

	.eval-stat--warn .eval-stat-count {
		color: var(--amber-dark);
	}

	:root[data-theme='dark'] .eval-stat--warn .eval-stat-count {
		color: var(--amber);
	}

	.eval-stat-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink-35);
	}

	.widget-empty {
		flex: 1;
		display: flex;
		align-items: center;
		padding: var(--sp-4);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-35);
	}

	.eval-list {
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		flex: 1;
	}

	.eval-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		padding: var(--sp-2) var(--sp-3);
		border-bottom: var(--border-rule);
	}

	.eval-row:last-child {
		border-bottom: none;
	}

	.eval-left {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}

	.eval-name {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink);
		font-weight: var(--font-weight-medium);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.eval-type {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-35);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.eval-right {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-shrink: 0;
	}

	.eval-status {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		white-space: nowrap;
	}

	.eval-date {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-35);
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	.cfg-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-60);
	}

	.cfg-select {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		background: var(--field-bg);
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		color: var(--ink);
		padding: 2px var(--sp-2);
		cursor: pointer;
	}
</style>
