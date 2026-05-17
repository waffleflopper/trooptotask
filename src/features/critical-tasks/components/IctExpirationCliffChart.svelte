<script lang="ts">
	import { buildReportCountTicks } from '$lib/components/charts/reportChartConventions';
	import { ReportBarChart } from '$lib/components/ui/report-chart';
	import * as ReportWorkspace from '$lib/components/ui/report-workspace';
	import type { IctExpirationCliff } from '$features/critical-tasks/utils/ictReports';

	interface Props {
		cliff: IctExpirationCliff;
		currentReadinessPercent?: number | null;
		loading?: boolean;
		heightClass?: string;
	}

	interface CliffChartDatum {
		label: string;
		total: number;
		[key: string]: number | string;
	}

	type CliffMonth = IctExpirationCliff['months'][number];

	interface CliffMonthWithMosCounts extends CliffMonth {
		expiringCountsByMos: Map<string, number>;
	}

	const EXPIRATION_SERIES_COLORS = [
		'var(--chart-1)',
		'var(--chart-2)',
		'var(--chart-3)',
		'var(--chart-4)',
		'var(--chart-5)'
	];

	let { cliff, currentReadinessPercent = null, loading = false, heightClass = 'h-[260px]' }: Props = $props();

	const hasExpirations = $derived(cliff.months.some((month) => month.totalExpiringCount > 0));
	const projectionChangeText = $derived(
		formatProjectionChange(cliff.projectedReadinessAtMonth6.readinessPercent, currentReadinessPercent)
	);
	const yMax = $derived(Math.max(1, ...cliff.months.map((month) => month.totalExpiringCount)));
	const yTicks = $derived.by(() => buildReportCountTicks(yMax, { denseMax: 5 }));
	const monthsWithMosCounts = $derived.by<CliffMonthWithMosCounts[]>(() =>
		cliff.months.map((month) => ({
			...month,
			expiringCountsByMos: new Map(month.mosSegments.map((segment) => [segment.mos, segment.expiringCount]))
		}))
	);
	const chartData = $derived.by<CliffChartDatum[]>(() =>
		monthsWithMosCounts.map((month) => ({
			label: (month.label.split(' ')[0] ?? month.label).toUpperCase(),
			total: month.totalExpiringCount,
			...Object.fromEntries(cliff.mosSeries.map((mos) => [seriesKey(mos), expiringCountForMos(month, mos)]))
		}))
	);
	const chartSeries = $derived.by(() =>
		cliff.mosSeries.map((mos, index) => ({
			key: seriesKey(mos),
			label: mos,
			color: EXPIRATION_SERIES_COLORS[index % EXPIRATION_SERIES_COLORS.length]
		}))
	);

	function seriesKey(mos: string): string {
		return `mos-${mos}`;
	}

	function expiringCountForMos(month: CliffMonthWithMosCounts, mos: string): number {
		return month.expiringCountsByMos.get(mos) ?? 0;
	}

	function formatProjectionMonth(label: string): string {
		return label.toUpperCase();
	}

	function formatProjectionChange(projectedPercent: number, currentPercent: number | null): string | null {
		if (currentPercent === null) return null;

		const delta = projectedPercent - currentPercent;
		const points = Math.abs(delta);
		if (delta < 0) return `a ${points}-point drop from current`;
		if (delta > 0) return `a ${points}-point gain from current`;
		return 'no change from current';
	}
</script>

<ReportWorkspace.Section
	title="Expiration Cliff - Next 6 Months"
	description="Task completion expirations over the next six calendar months, stacked by MOS."
	meta="Tasks lapsing by month"
	aria-busy={loading ? 'true' : 'false'}
	data-report-chart-section="true"
>
	{#if !hasExpirations}
		<ReportWorkspace.State
			state="no-data"
			title="No expiring completions"
			description="No task completions expire in the next 6 months for the active filters."
		/>
	{:else}
		<ReportBarChart
			data={chartData}
			series={chartSeries}
			ariaLabel="6-month expiration cliff chart"
			yDomain={[0, yMax]}
			{yTicks}
			layout="stack"
			{heightClass}
		/>

		<div
			class="mt-4 rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground"
			aria-label="Projected unit readiness without retraining"
		>
			<span>Projected unit readiness without retraining: </span>
			<strong class="font-mono text-danger">
				{cliff.projectedReadinessAtMonth6.readinessPercent}% by {formatProjectionMonth(
					cliff.projectedReadinessAtMonth6.label
				)}
			</strong>
			{#if projectionChangeText}
				<span> - {projectionChangeText}.</span>
			{/if}
		</div>
	{/if}

	<div class="sr-only">
		<table aria-label="6-month expiration cliff data">
			<thead>
				<tr>
					<th scope="col">Month</th>
					<th scope="col">Total expiring</th>
					{#each cliff.mosSeries as mos (mos)}
						<th scope="col">{mos} expiring</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each monthsWithMosCounts as month (month.month)}
					<tr>
						<td>{month.label}</td>
						<td>{month.totalExpiringCount}</td>
						{#each cliff.mosSeries as mos (mos)}
							<td>{expiringCountForMos(month, mos)}</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</ReportWorkspace.Section>
