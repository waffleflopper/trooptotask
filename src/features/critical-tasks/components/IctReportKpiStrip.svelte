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
	const soldiersBelowThresholdLabel = $derived(`Soldiers Below ${soldiersBelow70.thresholdPercent}%`);
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

	function applicableShare(count: number, total: number): number {
		if (total <= 0) return 0;
		return Math.round((count / total) * 100);
	}

	function pluralizeSoldier(count: number): string {
		return count === 1 ? 'soldier' : 'soldiers';
	}
</script>

<section
	class="relative flex flex-col"
	aria-label="Critical task report metrics"
	aria-busy={loading ? 'true' : 'false'}
>
	{#if loading}
		<span
			class="absolute -top-3 right-0 font-mono text-[0.625rem] uppercase tracking-[0.08em] text-amber-700"
			role="status"
		>
			Updating
		</span>
	{/if}
	<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
		<article
			class={[
				'relative min-h-30 overflow-hidden rounded-lg border bg-card p-4 text-card-foreground before:absolute before:inset-y-0 before:left-0 before:w-1',
				readinessTone(overall.percent) === 'good' && 'before:bg-emerald-600',
				readinessTone(overall.percent) === 'warning' && 'before:bg-amber-500',
				readinessTone(overall.percent) === 'bad' && 'before:bg-destructive'
			]}
			aria-label="Overall Readiness"
		>
			<p class="font-mono text-[0.625rem] uppercase tracking-[0.08em] text-muted-foreground">Overall Readiness</p>
			<p
				data-testid="ict-overall-readiness-value"
				class={[
					'my-2 text-5xl font-semibold leading-none text-foreground',
					readinessTone(overall.percent) === 'good' && 'text-emerald-700',
					readinessTone(overall.percent) === 'warning' && 'text-amber-700',
					readinessTone(overall.percent) === 'bad' && 'text-destructive'
				]}
			>
				{overall.percent}<span class="text-[0.58em]">%</span>
			</p>
			<p class="font-mono text-xs text-muted-foreground">
				<span
					class={[
						deltaTone(overall.deltaPercent) === 'good' && 'text-emerald-700',
						deltaTone(overall.deltaPercent) === 'bad' && 'text-destructive'
					]}
				>
					{formatDelta(overall.deltaPercent)}
				</span>
			</p>
		</article>

		<article
			class="relative min-h-30 overflow-hidden rounded-lg border bg-card p-4 text-card-foreground before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-destructive"
			aria-label={soldiersBelowThresholdLabel}
		>
			<p class="font-mono text-[0.625rem] uppercase tracking-[0.08em] text-muted-foreground">
				{soldiersBelowThresholdLabel}
			</p>
			<p class="my-2 text-5xl font-semibold leading-none text-destructive">{soldiersBelow70.count}</p>
			<p class="font-mono text-xs text-muted-foreground">
				of {soldiersBelow70.totalApplicable} applicable {pluralizeSoldier(soldiersBelow70.totalApplicable)} · {applicableShare(
					soldiersBelow70.count,
					soldiersBelow70.totalApplicable
				)}%
			</p>
		</article>

		<article
			class="relative min-h-30 overflow-hidden rounded-lg border bg-card p-4 text-card-foreground before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-amber-500"
			aria-label={tasksExpiringSoonLabel}
		>
			<p class="font-mono text-[0.625rem] uppercase tracking-[0.08em] text-muted-foreground">
				{tasksExpiringSoonLabel}
			</p>
			<p class="my-2 text-5xl font-semibold leading-none text-amber-700">{tasksExpiringSoon.count}</p>
			<p class="font-mono text-xs text-muted-foreground">
				across {tasksExpiringSoon.affectedSoldiers}
				{pluralizeSoldier(tasksExpiringSoon.affectedSoldiers)}
			</p>
		</article>

		<article
			class="relative min-h-30 overflow-hidden rounded-lg border bg-card p-4 text-card-foreground before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-destructive"
			aria-label="Tasks Below Threshold"
		>
			<p class="font-mono text-[0.625rem] uppercase tracking-[0.08em] text-muted-foreground">Tasks Below Threshold</p>
			<p class="my-2 text-5xl font-semibold leading-none text-destructive">{tasksBelowThreshold.count}</p>
			<p class="font-mono text-xs text-muted-foreground">&lt;{tasksBelowThreshold.thresholdPercent}% unit completion</p>
		</article>
	</div>
</section>
