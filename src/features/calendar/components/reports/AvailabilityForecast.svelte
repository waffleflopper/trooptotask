<script lang="ts">
	import type { Personnel, StatusType } from '$lib/types';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import * as ReportWorkspace from '$lib/components/ui/report-workspace/index.js';
	import type { ColumnDef } from '$lib/components/ui/data-table/index.js';
	import { useDataTable } from '$lib/components/ui/data-table/index.js';
	import { SvelteSet } from 'svelte/reactivity';
	import type { AvailabilityForecastResult, ForecastDay } from '../../utils/calendarReports';
	import { computeAvailabilityForecast } from '../../utils/calendarReports';
	import { exportAvailabilityForecastWorkbook } from './calendarReportWorkbookExport';
	import { fetchCalendarReportData, type CalendarReportData } from './calendarReportData';

	interface Props {
		orgId: string;
		personnel: Personnel[];
		statusTypes: StatusType[];
		groups: { id: string; name: string }[];
	}

	interface AvailabilityForecastRunData {
		startDate: string;
		endDate: string;
		personnel: Personnel[];
		data: CalendarReportData;
	}

	interface AvailabilityForecastReportResult extends AvailabilityForecastResult {
		startDate: string;
		endDate: string;
		personnelCount: number;
	}

	let { orgId, personnel, statusTypes, groups }: Props = $props();

	const initialRange = ReportWorkspace.FORECAST_PRESET[0].getRange();
	let startDate = $state(initialRange.start);
	let endDate = $state(initialRange.end);

	const expandedDates = new SvelteSet<string>();

	const groupSelect = ReportWorkspace.createMultiSelect(() => groups);
	const groupOptions = $derived(groups.map((group) => ({ id: group.id, label: group.name })));

	const filteredPersonnel = $derived.by(() => {
		if (groupSelect.allSelected) return personnel;
		return personnel.filter((person) => person.groupId && groupSelect.has(person.groupId));
	});

	const report = ReportWorkspace.createReportRun({
		validate: () => {
			if (!startDate || !endDate) return 'Select a date range.';
			if (filteredPersonnel.length === 0) return 'Select at least one group.';
			return null;
		},
		load: async (): Promise<AvailabilityForecastRunData> => {
			const runStartDate = startDate;
			const runEndDate = endDate;
			const runPersonnel = [...filteredPersonnel];
			const data = await fetchCalendarReportData(orgId, runStartDate, runEndDate);
			return { startDate: runStartDate, endDate: runEndDate, personnel: runPersonnel, data };
		},
		compute: (run): AvailabilityForecastReportResult => ({
			...computeAvailabilityForecast(run.personnel, run.data.entries, statusTypes, run.startDate, run.endDate),
			startDate: run.startDate,
			endDate: run.endDate,
			personnelCount: run.personnel.length
		})
	});

	const tableColumns: ColumnDef<ForecastDay>[] = [
		{ key: 'date', header: 'Date', value: (row) => row.date },
		{
			key: 'unavailable',
			header: 'Unavailable',
			value: (row) => row.unavailableCount,
			compare: (a, b) => a.unavailableCount - b.unavailableCount,
			align: 'center'
		},
		{
			key: 'available',
			header: 'Available',
			value: (row) => row.availableCount,
			compare: (a, b) => a.availableCount - b.availableCount,
			align: 'center'
		},
		{
			key: 'percent',
			header: 'Available percent',
			value: (row) => row.availablePercent,
			compare: (a, b) => a.availablePercent - b.availablePercent,
			align: 'center'
		}
	];

	const table = useDataTable({
		data: () => report.result?.days ?? [],
		columns: tableColumns,
		initialSortKey: 'unavailable',
		initialSortDirection: 'desc'
	});

	const resultMeta = $derived(
		report.result
			? `${report.result.days.length} days · ${report.result.personnelCount} personnel · ${report.result.startDate} to ${report.result.endDate}`
			: ''
	);

	const reportSummary = $derived.by(() => {
		if (!report.result) return null;
		const days = report.result.days;
		const topDay = days.reduce<ForecastDay | null>(
			(current, day) => (!current || day.unavailableCount > current.unavailableCount ? day : current),
			null
		);
		const daysBelowEighty = days.filter((day) => day.availablePercent < 80).length;
		const averageAvailable =
			days.length > 0 ? Math.round(days.reduce((sum, day) => sum + day.availablePercent, 0) / days.length) : 100;
		const maxUnavailable = topDay?.unavailableCount ?? 0;

		return {
			topRisk:
				topDay && maxUnavailable > 0
					? `${formatDisplayDate(topDay.date)} · ${maxUnavailable} unavailable (${topDay.availablePercent}% available)`
					: 'No unavailable personnel',
			population: `${report.result.personnelCount} personnel`,
			parameters: `${report.result.startDate} to ${report.result.endDate}`,
			findings: [
				daysBelowEighty > 0
					? `${daysBelowEighty} ${daysBelowEighty === 1 ? 'day is' : 'days are'} below 80% availability.`
					: 'All days are at or above 80% availability.',
				`${averageAvailable}% average availability across ${days.length} ${days.length === 1 ? 'day' : 'days'}.`,
				maxUnavailable > 0
					? `${maxUnavailable} unavailable on the highest-risk day.`
					: 'No unavailable personnel in the selected range.'
			],
			riskTone: maxUnavailable > 0 ? ('warning' as const) : ('success' as const)
		};
	});

	async function runReport() {
		expandedDates.clear();
		await report.run();
	}

	function toggleForecastRow(day: ForecastDay): void {
		if (day.unavailableCount === 0) return;
		if (expandedDates.has(day.date)) expandedDates.delete(day.date);
		else expandedDates.add(day.date);
	}

	function formatDisplayDate(dateStr: string): string {
		const [year, month, day] = dateStr.split('-');
		const date = new Date(Number(year), Number(month) - 1, Number(day));
		const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
		return `${weekday}, ${month}/${day}/${year}`;
	}

	async function handleExportExcel() {
		if (!report.result) return;
		await exportAvailabilityForecastWorkbook(report.result, report.result.startDate, report.result.endDate);
	}
</script>

<ReportWorkspace.Root ariaLabel="Availability by day report">
	<ReportWorkspace.Filters
		title="Build daily availability report"
		description="Shows available and unavailable personnel for each day in the range."
	>
		{#snippet dateRange()}
			<ReportWorkspace.DateRangeField
				bind:start={startDate}
				bind:end={endDate}
				presets={ReportWorkspace.FORECAST_PRESET}
			/>
		{/snippet}

		{#snippet actions()}
			<Button onclick={runReport} disabled={!report.canRun}>
				{report.status === 'loading' ? 'Checking availability...' : 'Run availability report'}
			</Button>
		{/snippet}

		<div class="min-w-0 space-y-2">
			<span class="font-mono text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground"> Groups </span>
			<ReportWorkspace.OptionList
				ariaLabel="Filter by group"
				options={groupOptions}
				selectedIds={groupSelect.selectedIds}
				onToggle={groupSelect.toggle}
				emptyMessage="No groups available."
			/>
			<p class="text-xs text-muted-foreground">
				{#if groupSelect.allSelected}
					All {personnel.length} personnel
				{:else if groupSelect.count === 0}
					No groups selected
				{:else}
					{filteredPersonnel.length} of {personnel.length} personnel
				{/if}
			</p>
		</div>
	</ReportWorkspace.Filters>

	{#if report.status === 'loading'}
		<ReportWorkspace.State state="loading" title="Checking daily availability" />
	{:else if report.status === 'error'}
		<ReportWorkspace.State
			state="error"
			title="Could not build availability report"
			description={report.error ?? undefined}
			onRetry={runReport}
			retryLabel="Run again"
		/>
	{:else if report.result}
		<ReportWorkspace.Table
			title="Availability by day"
			description="Expand a day to see unavailable personnel and their recorded status."
			meta={resultMeta}
			{table}
			columns={tableColumns}
			ariaLabel="Availability by day"
			emptyMessage="No calendar data falls in this date range. Try a different date range."
			onRowClick={toggleForecastRow}
			rowActionLabel={(day) =>
				day.unavailableCount > 0
					? `${expandedDates.has(day.date) ? 'Collapse' : 'Expand'} unavailable personnel for ${formatDisplayDate(day.date)}`
					: `Availability for ${formatDisplayDate(day.date)}`}
			rowDetailVisible={(day) => expandedDates.has(day.date)}
		>
			{#snippet actions()}
				<ReportWorkspace.ExportAction label="Export availability" onclick={handleExportExcel} />
			{/snippet}

			{#snippet summary()}
				{#if reportSummary}
					<ReportWorkspace.SummaryStrip
						topRisk={reportSummary.topRisk}
						population={reportSummary.population}
						parameters={reportSummary.parameters}
						findings={reportSummary.findings}
						riskTone={reportSummary.riskTone}
					/>
				{/if}
			{/snippet}

			{#snippet cell(day, column)}
				{#if column.key === 'date'}
					<span class="inline-flex items-center gap-1.5">
						{#if day.unavailableCount > 0}
							{#if expandedDates.has(day.date)}
								<MinusIcon class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
							{:else}
								<PlusIcon class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
							{/if}
						{:else}
							<span class="size-3.5 shrink-0" aria-hidden="true"></span>
						{/if}
						{formatDisplayDate(day.date)}
					</span>
				{:else if column.key === 'percent'}
					{day.availablePercent}%
				{:else}
					{String(column.value(day) ?? '')}
				{/if}
			{/snippet}

			{#snippet rowDetail(day)}
				<ul class="space-y-1">
					{#each day.unavailablePersonnel as entry (entry.person.id)}
						<li class="flex flex-wrap items-center gap-2 text-sm [overflow-wrap:anywhere]">
							<span class="min-w-0">{entry.person.rank} {entry.person.lastName}, {entry.person.firstName}</span>
							<Badge variant="outline">{entry.statusName}</Badge>
						</li>
					{/each}
				</ul>
			{/snippet}
		</ReportWorkspace.Table>
	{/if}
</ReportWorkspace.Root>
