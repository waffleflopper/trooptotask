<script lang="ts">
	import type { Personnel, StatusType } from '$lib/types';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as ReportWorkspace from '$lib/components/ui/report-workspace/index.js';
	import type { GroupReadinessResult, ReadinessGroupRow } from '../../utils/calendarReports';
	import { computeGroupReadiness } from '../../utils/calendarReports';
	import { exportGroupReadinessWorkbook } from './calendarReportWorkbookExport';
	import { fetchCalendarReportData } from './calendarReportData';

	interface Props {
		orgId: string;
		personnel: Personnel[];
		statusTypes: StatusType[];
		groups: { id: string; name: string }[];
	}

	let { orgId, personnel, groups }: Props = $props();

	const initialRange = ReportWorkspace.WEEK_PRESETS[0].getRange();
	let startDate = $state(initialRange.start);
	let endDate = $state(initialRange.end);

	const groupSelect = ReportWorkspace.createMultiSelect(() => groups);
	const report = ReportWorkspace.createReportRun({
		validate: () => {
			if (!startDate || !endDate) return 'Select a date range.';
			if (groupSelect.count === 0) return 'No groups selected.';
			return null;
		},
		load: () => fetchCalendarReportData(orgId, startDate, endDate),
		compute: (data): GroupReadinessResult =>
			computeGroupReadiness(personnel, data.entries, groups, groupSelect.selectedIds as Set<string>, startDate, endDate)
	});

	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	let groupSort = $state<'none' | 'asc' | 'desc'>('none');
	const tableRows = $derived.by(() => {
		const rows = report.result?.groups ?? [];
		if (groupSort === 'none') return rows;
		return [...rows].sort((a, b) => (groupSort === 'asc' ? sortByGroupName(a, b) : sortByGroupName(b, a)));
	});
	const resultMeta = $derived(
		report.result ? `${report.result.groups.length} groups · ${startDate} to ${endDate}` : ''
	);

	function formatShortDate(dateStr: string): string {
		const date = new Date(dateStr + 'T00:00:00');
		return `${dayNames[date.getDay()]} ${date.getMonth() + 1}/${date.getDate()}`;
	}

	function cellBackground(percent: number): string {
		if (percent >= 80) return 'color-mix(in srgb, var(--chart-2) 15%, transparent)';
		if (percent >= 50) return 'color-mix(in srgb, var(--accent) 15%, transparent)';
		return 'color-mix(in srgb, var(--destructive) 15%, transparent)';
	}

	function sortByGroupName(a: ReadinessGroupRow, b: ReadinessGroupRow): number {
		return a.groupName.localeCompare(b.groupName);
	}

	function toggleGroupSort() {
		groupSort = groupSort === 'asc' ? 'desc' : 'asc';
	}

	function handleExportExcel() {
		if (!report.result) return;
		return exportGroupReadinessWorkbook(report.result, startDate, endDate);
	}
</script>

<ReportWorkspace.Root ariaLabel="Group readiness report">
	<ReportWorkspace.Filters title="Report configuration">
		{#snippet dateRange()}
			<ReportWorkspace.DateRangeField
				bind:start={startDate}
				bind:end={endDate}
				presets={ReportWorkspace.WEEK_PRESETS}
			/>
		{/snippet}

		{#snippet actions()}
			<Button onclick={report.run} disabled={!report.canRun}>
				{report.status === 'loading' ? 'Generating...' : 'Generate Report'}
			</Button>
		{/snippet}

		<div class="min-w-0 space-y-2">
			<div class="flex flex-wrap items-center gap-2">
				<Button type="button" variant="outline" size="sm" onclick={groupSelect.toggleAll}>
					{groupSelect.allSelected ? 'Deselect All' : 'Select All'}
				</Button>
				<span class="text-xs text-muted-foreground">
					{groupSelect.count} of {groups.length} selected
				</span>
			</div>
			<div class="flex max-h-48 flex-col gap-0.5 overflow-y-auto rounded-md border border-border p-1">
				{#each groups as group (group.id)}
					<label class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted">
						<input type="checkbox" checked={groupSelect.has(group.id)} onchange={() => groupSelect.toggle(group.id)} />
						<span>{group.name}</span>
					</label>
				{/each}
			</div>
		</div>
	</ReportWorkspace.Filters>

	{#if report.status === 'loading'}
		<ReportWorkspace.State state="loading" title="Generating report" />
	{:else if report.status === 'error'}
		<ReportWorkspace.State state="error" title="Report failed" description={report.error ?? undefined} />
	{:else if report.result}
		<ReportWorkspace.Section title="Group readiness" meta={resultMeta}>
			{#snippet actions()}
				<ReportWorkspace.ExportAction label="Export Excel" onclick={handleExportExcel} />
			{/snippet}

			{#if report.result.groups.length === 0}
				<ReportWorkspace.State
					state="no-data"
					title="No data found"
					description="No group readiness rows matched the selected criteria."
				/>
			{:else}
				<div class="overflow-x-auto rounded-md border border-border">
					<table class="w-full border-collapse text-sm" aria-label="Group readiness heat map">
						<thead class="bg-muted">
							<tr>
								<th
									class="min-w-36 cursor-pointer border-b border-border px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase"
									aria-sort={groupSort === 'none' ? 'none' : groupSort === 'asc' ? 'ascending' : 'descending'}
									onclick={toggleGroupSort}
								>
									Group
								</th>
								{#each report.result.dates as dateStr (dateStr)}
									<th
										class="min-w-20 border-b border-border px-3 py-2 text-center text-xs font-semibold text-muted-foreground uppercase"
									>
										{formatShortDate(dateStr)}
									</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each tableRows as group (group.groupId)}
								<tr>
									<td class="border-b border-border/60 px-3 py-2 font-semibold">{group.groupName}</td>
									{#each group.cells as cell (cell.date)}
										<td
											class="border-b border-border/60 px-3 py-2 text-center tabular-nums"
											style:background={cellBackground(cell.availablePercent)}
										>
											{cell.availableCount}/{cell.totalPersonnel}
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</ReportWorkspace.Section>
	{/if}
</ReportWorkspace.Root>
