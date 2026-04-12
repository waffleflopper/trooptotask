<script lang="ts">
	import WidgetShell from './WidgetShell.svelte';
	import type { DashboardContext } from '../../contexts/DashboardContext.svelte';
	import type { WidgetInstanceConfig } from '../../dashboard.types';
	import { dashboardLayout } from '../../stores/dashboardLayout.svelte';

	interface Props {
		ctx: DashboardContext;
		widgetId: string;
		config: WidgetInstanceConfig;
		configureMode: boolean;
	}

	let { ctx, widgetId, config, configureMode }: Props = $props();

	let configOpen = $state(false);
	const showGroupBreakdown = $derived(config.showGroupBreakdown ?? true);
	const availPct = $derived(ctx.dutyStrengthPct);
	const isLow = $derived(availPct < 80);
	const isCritical = $derived(availPct < 60);
</script>

<WidgetShell
	label="Strength Today"
	href="/org/{ctx.data.orgId}/calendar"
	signal={isLow}
	{configureMode}
	{configOpen}
	onConfigToggle={() => (configOpen = !configOpen)}
>
	{#snippet config()}
		<label class="cfg-row">
			<input
				type="checkbox"
				checked={showGroupBreakdown}
				onchange={(e) => dashboardLayout.updateWidgetConfig(widgetId, { showGroupBreakdown: e.currentTarget.checked })}
			/>
			<span>Show group breakdown</span>
		</label>
	{/snippet}

	<div class="strength-content">
		<div class="strength-hero">
			<div class="strength-numbers">
				<span class="metric-primary" class:metric--warning={isLow} class:metric--critical={isCritical}>
					{ctx.availableCount}
				</span>
				<span class="metric-of">/ {ctx.totalPersonnel}</span>
			</div>
			<div class="strength-label">Present today</div>

			<div class="strength-bar-wrap" role="img" aria-label="{availPct}% strength">
				<div class="strength-bar">
					<div
						class="strength-bar-fill"
						class:strength-bar-fill--warning={isLow && !isCritical}
						class:strength-bar-fill--critical={isCritical}
						style="width: {availPct}%"
					></div>
				</div>
				<span class="strength-pct" class:metric--warning={isLow} class:metric--critical={isCritical}>
					{availPct}%
				</span>
			</div>
		</div>

		{#if ctx.unavailablePersonnelIds.size > 0}
			<div class="strength-status-row">
				{#each [...ctx.statusBreakdown.values()] as st (st.name)}
					<span class="status-chip" style="--chip-color: {st.color}">
						<span class="status-chip-dot"></span>
						{st.count}
						{st.name}
					</span>
				{/each}
			</div>
		{/if}

		{#if showGroupBreakdown && ctx.groupBreakdown.length > 0}
			<div class="group-breakdown">
				{#each ctx.groupBreakdown as group (group.id)}
					<div class="group-row">
						<span class="group-name">{group.name}</span>
						<div class="group-bar-wrap">
							<div class="group-bar">
								<div
									class="group-bar-fill"
									class:group-bar-fill--warning={group.pct < 80 && group.pct >= 60}
									class:group-bar-fill--critical={group.pct < 60}
									style="width: {group.pct}%"
								></div>
							</div>
						</div>
						<span class="group-fraction">{group.available}/{group.total}</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</WidgetShell>

<style>
	.strength-content {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		padding: var(--sp-4) var(--sp-4) var(--sp-3);
		flex: 1;
	}

	.strength-hero {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.strength-numbers {
		display: flex;
		align-items: baseline;
		gap: var(--sp-1);
	}

	.metric-primary {
		font-family: var(--font-display);
		font-size: var(--text-4xl);
		font-weight: var(--font-weight-display);
		line-height: 1;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}

	.metric-of {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--ink-35);
		font-variant-numeric: tabular-nums;
	}

	.metric--warning {
		color: var(--amber-dark);
	}

	:root[data-theme='dark'] .metric--warning {
		color: var(--amber);
	}

	.metric--critical {
		color: var(--danger);
	}

	.strength-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ink-35);
	}

	.strength-bar-wrap {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin-top: var(--sp-1);
	}

	.strength-bar {
		flex: 1;
		height: 4px;
		background: var(--ink-06);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}

	.strength-bar-fill {
		height: 100%;
		background: var(--success);
		border-radius: var(--radius-sm);
		transition: width var(--transition-slow);
	}

	.strength-bar-fill--warning {
		background: var(--amber);
	}

	.strength-bar-fill--critical {
		background: var(--danger);
	}

	.strength-pct {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-35);
		min-width: 32px;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.strength-status-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.status-chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-60);
	}

	.status-chip-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--chip-color, var(--ink-35));
		flex-shrink: 0;
	}

	.group-breakdown {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding-top: var(--sp-2);
		border-top: var(--border-rule);
	}

	.group-row {
		display: grid;
		grid-template-columns: minmax(60px, 1fr) auto auto;
		align-items: center;
		gap: var(--sp-2);
	}

	.group-name {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-60);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.group-bar-wrap {
		width: 64px;
	}

	.group-bar {
		height: 3px;
		background: var(--ink-06);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}

	.group-bar-fill {
		height: 100%;
		background: var(--success);
		border-radius: var(--radius-sm);
	}

	.group-bar-fill--warning {
		background: var(--amber);
	}

	.group-bar-fill--critical {
		background: var(--danger);
	}

	.group-fraction {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-35);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.cfg-row {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-60);
		cursor: pointer;
	}
</style>
