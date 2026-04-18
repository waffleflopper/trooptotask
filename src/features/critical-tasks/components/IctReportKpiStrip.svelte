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
	const tasksExpiringSoonLabel = $derived(`Tasks Expiring ≤${tasksExpiringSoon.windowDays}d`);

	function formatDelta(delta: number): string {
		if (delta > 0) return `▲ ${delta}% vs 30 days ago`;
		if (delta < 0) return `▼ ${Math.abs(delta)}% vs 30 days ago`;
		return '0% vs 30 days ago';
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

	function assignedShare(count: number, total: number): number {
		if (total <= 0) return 0;
		return Math.round((count / total) * 100);
	}

	function pluralizeSoldier(count: number): string {
		return count === 1 ? 'soldier' : 'soldiers';
	}
</script>

<section class="kpi-strip" aria-label="Critical task report metrics" aria-busy={loading ? 'true' : 'false'}>
	{#if loading}
		<span class="section-status" role="status">Updating</span>
	{/if}
	<div class="kpi-grid">
		<article
			class="kpi-card"
			class:kpi-card--good={readinessTone(overall.percent) === 'good'}
			class:kpi-card--warn={readinessTone(overall.percent) === 'warning'}
			class:kpi-card--alert={readinessTone(overall.percent) === 'bad'}
			aria-label="Overall Readiness"
		>
			<p class="kpi-label">Overall Readiness</p>
			<p
				class:good={readinessTone(overall.percent) === 'good'}
				class:warning={readinessTone(overall.percent) === 'warning'}
				class:bad={readinessTone(overall.percent) === 'bad'}
				class="kpi-value"
			>
				{overall.percent}<span class="kpi-unit">%</span>
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

		<article class="kpi-card kpi-card--alert" aria-label="Soldiers Below 70%">
			<p class="kpi-label">Soldiers Below 70%</p>
			<p class="kpi-value bad">{soldiersBelow70.count}</p>
			<p class="kpi-subtitle">
				of {soldiersBelow70.totalAssigned} assigned · {assignedShare(
					soldiersBelow70.count,
					soldiersBelow70.totalAssigned
				)}%
			</p>
		</article>

		<article class="kpi-card kpi-card--warn" aria-label={tasksExpiringSoonLabel}>
			<p class="kpi-label">{tasksExpiringSoonLabel}</p>
			<p class="kpi-value warning">{tasksExpiringSoon.count}</p>
			<p class="kpi-subtitle">
				across {tasksExpiringSoon.affectedSoldiers}
				{pluralizeSoldier(tasksExpiringSoon.affectedSoldiers)}
			</p>
		</article>

		<article class="kpi-card kpi-card--alert" aria-label="Tasks Below Threshold">
			<p class="kpi-label">Tasks Below Threshold</p>
			<p class="kpi-value bad">{tasksBelowThreshold.count}</p>
			<p class="kpi-subtitle">&lt;{tasksBelowThreshold.thresholdPercent}% unit completion</p>
		</article>
	</div>
</section>

<style>
	.kpi-strip {
		position: relative;
		display: flex;
		flex-direction: column;
	}

	.section-status {
		position: absolute;
		top: calc(var(--sp-3) * -1);
		right: 0;
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--amber-dark);
	}

	.kpi-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--sp-3);
	}

	.kpi-card {
		position: relative;
		min-height: 7.5rem;
		overflow: hidden;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		padding: 18px var(--sp-5);
	}

	.kpi-card::before {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		width: 3px;
		background: color-mix(in srgb, var(--text-secondary) 28%, transparent);
	}

	.kpi-card--alert::before {
		background: var(--danger);
	}

	.kpi-card--warn::before {
		background: var(--amber);
	}

	.kpi-card--good::before {
		background: var(--success);
	}

	.kpi-label,
	.kpi-subtitle,
	.delta-value {
		font-family: var(--font-mono);
	}

	.kpi-label {
		margin: 0;
		font-size: 0.625rem;
		font-weight: var(--font-weight-regular);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.kpi-value {
		margin: 10px 0;
		font-family: var(--font-display);
		font-size: 3rem;
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.01em;
		line-height: 0.95;
		color: var(--text-primary);
	}

	.kpi-unit {
		font-size: 0.58em;
	}

	.kpi-subtitle {
		margin: 0;
		font-size: 0.6875rem;
		letter-spacing: 0.03em;
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
