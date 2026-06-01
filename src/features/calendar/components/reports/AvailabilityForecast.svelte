<script lang="ts">
	import type { Personnel, StatusType } from '$lib/types';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as ReportWorkspace from '$lib/components/ui/report-workspace/index.js';
	import type { ColumnDef } from '$lib/components/ui/data-table/index.js';
	import { useDataTable } from '$lib/components/ui/data-table/index.js';
	import { SvelteSet } from 'svelte/reactivity';
	import type { AvailabilityForecastResult, ForecastDay } from '../../utils/calendarReports';
	import { computeAvailabilityForecast } from '../../utils/calendarReports';
	import { exportAvailabilityForecastWorkbook } from './calendarReportWorkbookExport';
	import { fetchCalendarReportData } from './calendarReportData';

	interface Props {
		orgId: string;
		personnel: Personnel[];
		statusTypes: StatusType[];
		groups: { id: string; name: string }[];
	}

	let { orgId, personnel, statusTypes, groups }: Props = $props();

	const initialRange = ReportWorkspace.FORECAST_PRESET[0].getRange();
	let startDate = $state(initialRange.start);
	let endDate = $state(initialRange.end);

	const selectedGroupIds = new SvelteSet<string>();
	const expandedDates = new SvelteSet<string>();

	const filteredPersonnel = $derived.by(() => {
		if (selectedGroupIds.size === 0) return personnel;
		return personnel.filter((person) => person.groupId && selectedGroupIds.has(person.groupId));
	});

	const report = ReportWorkspace.createReportRun({
		validate: () => {
			if (!startDate || !endDate) return 'Select a date range.';
			if (filteredPersonnel.length === 0) return 'No personnel selected.';
			return null;
		},
		load: () => fetchCalendarReportData(orgId, startDate, endDate),
		compute: (data): AvailabilityForecastResult =>
			computeAvailabilityForecast(filteredPersonnel, data.entries, statusTypes, startDate, endDate)
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
			header: 'Available %',
			value: (row) => row.availablePercent,
			compare: (a, b) => a.availablePercent - b.availablePercent,
			align: 'center'
		}
	];

	const table = useDataTable({
		data: () => report.result?.days ?? [],
		columns: tableColumns,
		initialSortKey: 'date'
	});

	const resultMeta = $derived(
		report.result
			? `${report.result.days.length} days · ${filteredPersonnel.length} personnel · ${startDate} to ${endDate}`
			: ''
	);

	function toggleGroup(groupId: string) {
		if (selectedGroupIds.has(groupId)) selectedGroupIds.delete(groupId);
		else selectedGroupIds.add(groupId);
	}

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
		await exportAvailabilityForecastWorkbook(report.result, startDate, endDate);
	}
</script>

<ReportWorkspace.Root ariaLabel="Availability forecast report">
	<ReportWorkspace.Filters title="Report configuration">
		{#snippet dateRange()}
			<ReportWorkspace.DateRangeField
				bind:start={startDate}
				bind:end={endDate}
				presets={ReportWorkspace.FORECAST_PRESET}
			/>
		{/snippet}

		{#snippet actions()}
			<Button onclick={runReport} disabled={!report.canRun}>
				{report.status === 'loading' ? 'Generating...' : 'Generate Report'}
			</Button>
		{/snippet}

		<div class="min-w-0 space-y-2">
			<div class="flex max-h-48 flex-col gap-0.5 overflow-y-auto rounded-md border border-border p-1">
				{#each groups as group (group.id)}
					<label class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted">
						<input type="checkbox" checked={selectedGroupIds.has(group.id)} onchange={() => toggleGroup(group.id)} />
						<span>{group.name}</span>
					</label>
				{/each}
			</div>
			<p class="text-xs text-muted-foreground">
				{filteredPersonnel.length} of {personnel.length} personnel selected
				{#if selectedGroupIds.size === 0}
					(all)
				{/if}
			</p>
		</div>
	</ReportWorkspace.Filters>

	{#if report.status === 'loading'}
		<ReportWorkspace.State state="loading" title="Generating report" />
	{:else if report.status === 'error'}
		<ReportWorkspace.State state="error" title="Report failed" description={report.error ?? undefined} />
	{:else if report.result}
		<ReportWorkspace.Table
			title="Availability forecast"
			meta={resultMeta}
			{table}
			columns={tableColumns}
			ariaLabel="Availability forecast"
			emptyMessage="No data found for the selected criteria."
			onRowClick={toggleForecastRow}
			rowActionLabel={(day) =>
				day.unavailableCount > 0
					? `${expandedDates.has(day.date) ? 'Collapse' : 'Expand'} unavailable personnel for ${formatDisplayDate(day.date)}`
					: `Availability for ${formatDisplayDate(day.date)}`}
			rowDetailVisible={(day) => expandedDates.has(day.date)}
		>
			{#snippet actions()}
				<ReportWorkspace.ExportAction label="Export Excel" onclick={handleExportExcel} />
			{/snippet}

			{#snippet cell(day, column)}
				{#if column.key === 'date'}
					{#if day.unavailableCount > 0}
						{expandedDates.has(day.date) ? 'Collapse' : 'Expand'} {formatDisplayDate(day.date)}
					{:else}
						{formatDisplayDate(day.date)}
					{/if}
				{:else if column.key === 'percent'}
					{day.availablePercent}%
				{:else}
					{String(column.value(day) ?? '')}
				{/if}
			{/snippet}

			{#snippet rowDetail(day)}
				<ul class="space-y-1">
					{#each day.unavailablePersonnel as entry (entry.person.id)}
						<li class="flex flex-wrap items-center gap-2 text-sm">
							<span>{entry.person.rank} {entry.person.lastName}, {entry.person.firstName}</span>
							<Badge variant="outline">{entry.statusName}</Badge>
						</li>
					{/each}
				</ul>
			{/snippet}
		</ReportWorkspace.Table>
	{/if}
</ReportWorkspace.Root>
