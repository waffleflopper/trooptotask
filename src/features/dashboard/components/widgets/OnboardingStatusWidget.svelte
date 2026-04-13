<script lang="ts">
	import WidgetShell from './WidgetShell.svelte';
	import type { DashboardContext } from '../../contexts/DashboardContext.svelte';
	interface Props {
		ctx: DashboardContext;
		configureMode?: boolean;
	}

	let { ctx, configureMode = false }: Props = $props();

	const onboardings = $derived(ctx.activeOnboardings);
	const sorted = $derived([...onboardings].sort((a, b) => a.pct - b.pct || a.personName.localeCompare(b.personName)));
</script>

<WidgetShell label="Onboarding Status" href="/org/{ctx.data.orgId}/onboarding" {configureMode}>
	{#if onboardings.length === 0}
		<div class="widget-empty">
			<span>No active onboardings.</span>
		</div>
	{:else}
		<div class="ob-header">
			<span class="ob-count">{onboardings.length}</span>
			<span class="ob-count-label">active</span>
		</div>
		<div class="ob-list" role="list">
			{#each sorted as ob (ob.id)}
				<div class="ob-row" role="listitem">
					<div class="ob-top">
						<span class="ob-name">{ob.personName}</span>
						<span class="ob-pct" class:ob-pct--complete={ob.pct === 100}>{ob.pct}%</span>
					</div>
					<div class="ob-bar" role="img" aria-label="{ob.pct}% complete">
						<div class="ob-bar-fill" class:ob-bar-fill--complete={ob.pct === 100} style="width: {ob.pct}%"></div>
					</div>
					<div class="ob-steps">
						{ob.completedSteps} / {ob.totalSteps} steps
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

	.ob-header {
		display: flex;
		align-items: baseline;
		gap: var(--sp-1);
		padding: var(--sp-3) var(--sp-3) var(--sp-2);
		border-bottom: var(--border-rule);
		flex-shrink: 0;
	}

	.ob-count {
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		font-weight: var(--font-weight-display);
		line-height: 1;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}

	.ob-count-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ink-35);
	}

	.ob-list {
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		flex: 1;
	}

	.ob-row {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: var(--sp-2) var(--sp-3);
		border-bottom: var(--border-rule);
	}

	.ob-row:last-child {
		border-bottom: none;
	}

	.ob-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-2);
	}

	.ob-name {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink);
		font-weight: var(--font-weight-medium);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.ob-pct {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-35);
		flex-shrink: 0;
		font-variant-numeric: tabular-nums;
	}

	.ob-pct--complete {
		color: var(--success);
	}

	.ob-bar {
		height: 3px;
		background: var(--ink-06);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}

	.ob-bar-fill {
		height: 100%;
		background: var(--amber);
		border-radius: var(--radius-sm);
		transition: width var(--transition-slow);
	}

	.ob-bar-fill--complete {
		background: var(--success);
	}

	.ob-steps {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-35);
		font-variant-numeric: tabular-nums;
	}
</style>
