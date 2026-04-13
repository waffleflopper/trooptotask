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
	const dayCount = $derived(config.dayCount ?? 2);
	const days = $derived(ctx.dutyForDays(dayCount));
	const hasAny = $derived(days.some((d) => d.assignments.length > 0));

	const DAY_LABELS: Record<number, string> = { 0: 'Today', 1: 'Tomorrow' };
	function dayLabel(index: number, dateStr: string): string {
		if (DAY_LABELS[index]) return DAY_LABELS[index];
		const d = new Date(dateStr + 'T00:00:00');
		return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
	}
</script>

<WidgetShell
	label="Duty Roster"
	href="/org/{ctx.data.orgId}/calendar"
	{configureMode}
	{configOpen}
	onConfigToggle={() => (configOpen = !configOpen)}
>
	{#snippet config()}
		<label class="cfg-row">
			<span>Days to show</span>
			<select
				class="cfg-select"
				value={dayCount}
				onchange={(e) => dashboardLayout.updateWidgetConfig(widgetId, { dayCount: Number(e.currentTarget.value) })}
			>
				<option value={1}>Today only</option>
				<option value={2}>Today + Tomorrow</option>
				<option value={3}>3 days</option>
				<option value={7}>7 days</option>
			</select>
		</label>
	{/snippet}

	{#if !hasAny}
		<div class="widget-empty">
			<span>No duty assignments logged.</span>
		</div>
	{:else}
		<div class="duty-days">
			{#each days as day, i (day.date)}
				{#if day.assignments.length > 0}
					<div class="duty-day">
						<div class="duty-day-label">{dayLabel(i, day.date)}</div>
						{#each day.assignments as assignment (assignment.id)}
							<div class="duty-row">
								<span class="duty-badge" style="background: {assignment.color}; color: {assignment.textColor}">
									{assignment.shortName || assignment.typeName.slice(0, 3).toUpperCase()}
								</span>
								<span class="duty-type">{assignment.typeName}</span>
								<span class="duty-assignee">{assignment.assigneeName || '—'}</span>
							</div>
						{/each}
					</div>
				{:else if i === 0}
					<div class="duty-day">
						<div class="duty-day-label">{dayLabel(i, day.date)}</div>
						<div class="duty-none">No assignments</div>
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</WidgetShell>

<style>
	.widget-empty {
		flex: 1;
		display: flex;
		align-items: center;
		padding: var(--sp-4);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-35);
	}

	.duty-days {
		display: flex;
		flex-direction: column;
		flex: 1;
		overflow-y: auto;
	}

	.duty-day {
		padding: var(--sp-2) var(--sp-3) var(--sp-3);
	}

	.duty-day + .duty-day {
		border-top: var(--border-rule);
	}

	.duty-day-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ink-35);
		margin-bottom: var(--sp-2);
	}

	.duty-row {
		display: grid;
		grid-template-columns: 28px 1fr auto;
		align-items: center;
		gap: var(--sp-2);
		padding: 4px 0;
	}

	.duty-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 20px;
		border-radius: var(--radius-sm);
		font-family: var(--font-mono);
		font-size: 9px;
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.04em;
		flex-shrink: 0;
	}

	.duty-type {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-60);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.duty-assignee {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink);
		font-weight: var(--font-weight-medium);
		white-space: nowrap;
	}

	.duty-none {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-35);
		padding: 4px 0;
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
