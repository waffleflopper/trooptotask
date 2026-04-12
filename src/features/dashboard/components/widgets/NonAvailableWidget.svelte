<script lang="ts">
	import WidgetShell from './WidgetShell.svelte';
	import type { DashboardContext } from '../../contexts/DashboardContext.svelte';
	import type { WidgetInstanceConfig } from '../../dashboard.types';

	interface Props {
		ctx: DashboardContext;
		config: WidgetInstanceConfig;
		configureMode: boolean;
	}

	let { ctx, config, configureMode }: Props = $props();

	const personnel = $derived(ctx.nonAvailablePersonnel);
	const hasFilter = $derived((config.statusTypeFilter?.length ?? 0) > 0);
	const filtered = $derived(
		hasFilter ? personnel.filter((p) => config.statusTypeFilter!.includes(p.statusTypeId)) : personnel
	);
</script>

<WidgetShell label="Non-Available" href="/org/{ctx.data.orgId}/calendar" signal={filtered.length > 0} {configureMode}>
	{#if filtered.length === 0}
		<div class="widget-empty">
			<span>All personnel available today.</span>
		</div>
	{:else}
		<div class="na-list" role="list">
			{#each filtered as p (p.id)}
				<div class="na-row" role="listitem">
					<div class="na-name">{p.personName}</div>
					<div class="na-right">
						<span class="na-status-dot" style="background: {p.statusColor}"></span>
						<span class="na-status">{p.statusName}</span>
						<span class="na-dates">{ctx.formatShortDate(p.startDate)} – {ctx.formatShortDate(p.endDate)}</span>
					</div>
				</div>
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

	.na-list {
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		max-height: 280px;
		flex: 1;
	}

	.na-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		padding: var(--sp-2) var(--sp-3);
		border-bottom: var(--border-rule);
	}

	.na-row:last-child {
		border-bottom: none;
	}

	.na-name {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink);
		font-weight: var(--font-weight-medium);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	.na-right {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-shrink: 0;
	}

	.na-status-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.na-status {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-60);
		white-space: nowrap;
	}

	.na-dates {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-35);
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
</style>
