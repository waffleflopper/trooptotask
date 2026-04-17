<script lang="ts">
	import type { IctReportDashboard } from '$features/critical-tasks/utils/ictReports';

	interface Props {
		dashboard: IctReportDashboard;
		loading?: boolean;
	}

	let { dashboard, loading = false }: Props = $props();

	const overall = $derived(dashboard.kpis.overallReadiness);
	const soldiersBelow70 = $derived(dashboard.kpis.soldiersBelow70);
	const tasksExpiringSoon = $derived(dashboard.kpis.tasksExpiringSoon);
	const tasksBelowThreshold = $derived(dashboard.kpis.tasksBelowThreshold);

	function formatDelta(delta: number): string {
		if (delta > 0) return `+${delta} pts vs 30d`;
		if (delta < 0) return `${delta} pts vs 30d`;
		return '0 pts vs 30d';
	}

	function deltaTone(delta: number): 'good' | 'bad' | 'neutral' {
		if (delta > 0) return 'good';
		if (delta < 0) return 'bad';
		return 'neutral';
	}

	function readinessTone(percent: number): 'good' | 'warning' | 'bad' {
		if (percent >= 80) return 'good';
		if (percent >= 70) return 'warning';
		return 'bad';
	}
</script>

<section class="kpi-strip" aria-labelledby="critical-task-report-kpis-title" aria-busy={loading ? 'true' : 'false'}>
	<div class="section-header">
		<h2 id="critical-task-report-kpis-title">Action KPIs</h2>
		{#if loading}
			<span class="section-status">Updating</span>
		{/if}
	</div>

	<div class="kpi-grid">
		<article class="kpi-card" aria-label="Overall Readiness">
			<p class="kpi-label">Overall Readiness</p>
			<p
				class:good={readinessTone(overall.percent) === 'good'}
				class:warning={readinessTone(overall.percent) === 'warning'}
				class:bad={readinessTone(overall.percent) === 'bad'}
				class="kpi-value"
			>
				{overall.percent}%
			</p>
			<p class="kpi-subtitle">
				<span
					class:good={deltaTone(overall.deltaPercent) === 'good'}
					class:bad={deltaTone(overall.deltaPercent) === 'bad'}
					class="delta-value"
				>
					{formatDelta(overall.deltaPercent)}
				</span>
			</p>
		</article>

		<article class="kpi-card" aria-label="Soldiers Below 70%">
			<p class="kpi-label">Soldiers Below 70%</p>
			<p class="kpi-value bad">{soldiersBelow70.count}</p>
			<p class="kpi-subtitle">{soldiersBelow70.totalAssigned} assigned</p>
		</article>

		<article class="kpi-card" aria-label="Tasks Expiring ≤30d">
			<p class="kpi-label">Tasks Expiring ≤30d</p>
			<p class="kpi-value warning">{tasksExpiringSoon.count}</p>
			<p class="kpi-subtitle">{tasksExpiringSoon.affectedSoldiers} Soldiers affected</p>
		</article>

		<article class="kpi-card" aria-label="Tasks Below Threshold">
			<p class="kpi-label">Tasks Below Threshold</p>
			<p class="kpi-value bad">{tasksBelowThreshold.count}</p>
			<p class="kpi-subtitle">Below {tasksBelowThreshold.thresholdPercent}% unit completion</p>
		</article>
	</div>
</section>

<style>
	.kpi-strip {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.section-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--sp-3);
		border-bottom: 0.5px solid var(--border-default);
		padding-bottom: var(--sp-2);
	}

	.section-header h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		font-weight: var(--font-weight-display);
		line-height: 0.95;
		text-transform: uppercase;
		color: var(--text-primary);
	}

	.section-status {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		color: var(--amber-dark);
	}

	.kpi-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--sp-2);
	}

	.kpi-card {
		min-height: 8.5rem;
		padding: var(--sp-4);
		border: 0.5px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.kpi-label,
	.kpi-subtitle,
	.delta-value {
		font-family: var(--font-mono);
	}

	.kpi-label {
		margin: 0;
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.kpi-value {
		margin: var(--sp-3) 0 var(--sp-1);
		font-family: var(--font-display);
		font-size: var(--text-4xl);
		font-weight: var(--font-weight-display);
		line-height: 0.9;
		color: var(--text-primary);
	}

	.kpi-subtitle {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-secondary);
	}

	.good {
		color: var(--success);
	}

	.warning {
		color: var(--amber-dark);
	}

	.bad {
		color: var(--danger);
	}

	@media (max-width: 900px) {
		.kpi-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 560px) {
		.kpi-grid {
			grid-template-columns: 1fr;
		}

		.kpi-value {
			font-size: var(--text-3xl);
		}
	}
</style>
