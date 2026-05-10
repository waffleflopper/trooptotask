<script lang="ts">
	import { REPORT_CHART_SERIES, buildReportCountTicks } from '$lib/components/charts/reportChartConventions';
	import { ReportBarChart } from '$lib/components/ui/report-chart';
	import * as NativeSelect from '$lib/components/ui/native-select';
	import * as ReportWorkspace from '$lib/components/ui/report-workspace';
	import type { IctReadinessDistribution } from '$features/critical-tasks/utils/ictReports';

	interface Props {
		distribution: IctReadinessDistribution;
		selectedPageMos?: string[];
		loading?: boolean;
	}

	interface DistributionChartDatum {
		label: string;
		[key: string]: number | string;
	}

	let { distribution, selectedPageMos = [], loading = false }: Props = $props();
	let selectedMos = $state<string | null>(null);

	const overlayMode = $derived(selectedPageMos.length >= 2);
	const selectedHistogramMos = $derived.by(() => {
		const pageMos = selectedPageMos.length === 1 ? selectedPageMos[0] : null;
		const requestedMos = selectedMos ?? pageMos ?? distribution.defaultMos ?? '';
		if (distribution.series.some((series) => series.mos === requestedMos)) return requestedMos;
		return distribution.series[0]?.mos ?? '';
	});
	const activeSeries = $derived.by(() => {
		if (overlayMode) {
			const selectedMosSet = new Set(selectedPageMos);
			return distribution.series.filter((series) => selectedMosSet.has(series.mos));
		}

		return distribution.series.filter((series) => series.mos === selectedHistogramMos);
	});
	const hasDistribution = $derived(activeSeries.length > 0);
	const yMax = $derived(Math.max(1, ...activeSeries.flatMap((series) => series.bins.map((bin) => bin.soldierCount))));
	const yTicks = $derived.by(() => buildReportCountTicks(yMax, { denseMax: 4 }));
	const chartData = $derived.by<DistributionChartDatum[]>(() =>
		distribution.bins.map((bin) => ({
			label: bin.label,
			...Object.fromEntries(
				activeSeries.map((series) => [
					seriesKey(series.mos),
					series.bins.find((seriesBin) => seriesBin.key === bin.key)?.soldierCount ?? 0
				])
			)
		}))
	);
	const chartSeries = $derived.by(() =>
		activeSeries.map((series, index) => {
			const convention = REPORT_CHART_SERIES[index % REPORT_CHART_SERIES.length];
			return {
				key: seriesKey(series.mos),
				label: `${series.mos} (${selectedSeriesCount(series)})`,
				color: convention.color
			};
		})
	);

	function seriesKey(mos: string): string {
		return `mos-${mos}`;
	}

	function pluralizeSoldier(count: number): string {
		return count === 1 ? 'Soldier' : 'Soldiers';
	}

	function selectedSeriesCount(series: { personnelCount: number }): string {
		return `${series.personnelCount} ${pluralizeSoldier(series.personnelCount)}`;
	}
</script>

<ReportWorkspace.Section
	title="Distribution - Individual Readiness by MOS"
	description="Soldiers grouped by individual readiness percentage for the selected MOS context."
	meta="Soldiers by readiness band"
	aria-busy={loading ? 'true' : 'false'}
	data-report-chart-section="true"
>
	<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<p class="text-sm text-muted-foreground">Soldiers grouped by individual readiness percentage.</p>
		{#if overlayMode}
			<span class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
				Overlaying selected MOS filters.
			</span>
		{:else if distribution.series.length > 1}
			<label
				class="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
			>
				Histogram MOS
				<NativeSelect.Root
					value={selectedHistogramMos}
					aria-label="Histogram MOS"
					disabled={loading}
					class="min-w-44"
					onchange={(event) => (selectedMos = event.currentTarget.value)}
				>
					{#each distribution.series as series (series.mos)}
						<NativeSelect.Option value={series.mos}>
							{series.mos} ({selectedSeriesCount(series)})
						</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</label>
		{/if}
	</div>

	{#if !hasDistribution}
		<ReportWorkspace.State
			state="no-data"
			title="No readiness distribution"
			description="No Soldiers are available for the selected MOS/filter context."
		/>
	{:else}
		<ReportBarChart
			data={chartData}
			series={chartSeries}
			ariaLabel="Individual readiness distribution histogram"
			yDomain={[0, yMax]}
			{yTicks}
			layout={overlayMode ? 'overlap' : 'group'}
			heightClass="min-h-[260px]"
		/>

		<div class="sr-only">
			<table aria-label="Individual readiness distribution data">
				<thead>
					<tr>
						<th scope="col">Readiness band</th>
						{#each activeSeries as series (series.mos)}
							<th scope="col">{series.mos} Soldiers</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each distribution.bins as bin (bin.key)}
						<tr>
							<td>{bin.label}</td>
							{#each activeSeries as series (series.mos)}
								<td>{series.bins.find((seriesBin) => seriesBin.key === bin.key)?.soldierCount ?? 0}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</ReportWorkspace.Section>
