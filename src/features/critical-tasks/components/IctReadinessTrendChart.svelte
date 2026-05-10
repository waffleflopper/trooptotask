<script lang="ts">
	import { REPORT_CHART_SERIES, readinessTrendDomain } from '$lib/components/charts/reportChartConventions';
	import { ReportLineChart } from '$lib/components/ui/report-chart';
	import * as ReportWorkspace from '$lib/components/ui/report-workspace';
	import type { IctReadinessTrend, IctReadinessTrendMonth } from '$features/critical-tasks/utils/ictReports';

	interface Props {
		trend: IctReadinessTrend;
		loading?: boolean;
	}

	interface TrendDatum {
		label: string;
		unit: number;
		[key: string]: number | string;
	}

	let { trend, loading = false }: Props = $props();

	const hasTrendData = $derived(
		trend.months.some(
			(month) => month.overallApplicableCount > 0 || month.mosReadiness.some((snapshot) => snapshot.applicableCount > 0)
		)
	);
	const chartValues = $derived.by(() => {
		if (!hasTrendData) return [];
		return trend.months.flatMap((month) => [
			month.overallReadinessPercent,
			...month.mosReadiness.map((snapshot) => snapshot.readinessPercent)
		]);
	});
	const yDomain = $derived<[number, number]>(readinessTrendDomain(chartValues) ?? [50, 100]);
	const usesFullScale = $derived(yDomain[0] === 0);
	const yTicks = $derived.by(() => (usesFullScale ? [0, 20, 40, 60, 80, 100] : [50, 60, 70, 80, 90, 100]));
	const chartData = $derived.by<TrendDatum[]>(() =>
		trend.months.map((month) => ({
			label: month.label,
			unit: month.overallReadinessPercent,
			...Object.fromEntries(
				trend.comparisonMos.map((mos) => [seriesKey(mos), mosSnapshot(month, mos)?.readinessPercent ?? 0])
			)
		}))
	);
	const chartSeries = $derived.by(() => [
		{
			key: 'unit',
			label: 'Unit',
			color: REPORT_CHART_SERIES[0].color,
			strokeWidth: 2.5
		},
		...trend.comparisonMos.map((mos, index) => {
			const convention = REPORT_CHART_SERIES[(index + 1) % REPORT_CHART_SERIES.length];
			return {
				key: seriesKey(mos),
				label: mos,
				color: convention.color,
				strokeWidth: 1.75
			};
		})
	]);

	function seriesKey(mos: string): string {
		return `mos-${mos}`;
	}

	function mosSnapshot(month: IctReadinessTrendMonth, mos: string) {
		return month.mosReadiness.find((snapshot) => snapshot.mos === mos);
	}

	function formatPercent(value: number): string {
		return `${value}%`;
	}
</script>

<ReportWorkspace.Section
	title="Readiness Trend - 12 Months"
	description="Unit readiness over time with top MOS comparisons by filtered headcount."
	meta="% current"
	aria-busy={loading ? 'true' : 'false'}
	data-report-chart-section="true"
>
	{#if !hasTrendData}
		<ReportWorkspace.State
			state="no-data"
			title="No readiness trend data"
			description="No readiness trend data is available for the active filters."
		/>
	{:else}
		<ReportLineChart
			data={chartData}
			series={chartSeries}
			ariaLabel="12-month readiness trend chart"
			{yDomain}
			{yTicks}
			heightClass="min-h-[260px]"
		/>
		{#if usesFullScale}
			<p class="mt-3 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
				Readiness fell below 50%, so this chart uses the full 0-100% scale.
			</p>
		{/if}

		<div class="sr-only">
			<table aria-label="12-month readiness trend data">
				<thead>
					<tr>
						<th scope="col">Month</th>
						<th scope="col">Unit-wide readiness</th>
						{#each trend.comparisonMos as mos (mos)}
							<th scope="col">{mos} readiness</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each trend.months as month (month.month)}
						<tr>
							<td>{month.label}</td>
							<td>{formatPercent(month.overallReadinessPercent)}</td>
							{#each trend.comparisonMos as mos (mos)}
								<td>{formatPercent(mosSnapshot(month, mos)?.readinessPercent ?? 0)}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</ReportWorkspace.Section>
