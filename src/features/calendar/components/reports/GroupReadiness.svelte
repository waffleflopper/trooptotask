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
	const groupOptions = $derived(groups.map((group) => ({ id: group.id, label: group.name })));
	const report = ReportWorkspace.createReportRun({
		validate: () => {
			if (!startDate || !endDate) return 'Select a date range.';
			if (groupSelect.count === 0) return 'Select at least one group.';
			return null;
		},
		load: () => fetchCalendarReportData(orgId, startDate, endDate),
		compute: (data): GroupReadinessResult =>
			computeGroupReadiness(personnel, data.entries, groups, groupSelect.selectedIds as Set<string>, startDate, endDate)
	});

	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	let groupSort = $state<'risk-asc' | 'risk-desc' | 'group-asc' | 'group-desc'>('risk-asc');
	const tableRows = $derived.by(() => {
		const rows = report.result?.groups ?? [];
		return [...rows].sort((a, b) => {
			if (groupSort === 'group-asc') return sortByGroupName(a, b);
			if (groupSort === 'group-desc') return sortByGroupName(b, a);
			return groupSort === 'risk-asc' ? sortByGroupRisk(a, b) : sortByGroupRisk(b, a);
		});
	});
	const resultMeta = $derived(
		report.result ? `${report.result.groups.length} groups · ${startDate} to ${endDate}` : ''
	);

	const reportSummary = $derived.by(() => {
		if (!report.result) return null;
		const groupsInReport = report.result.groups;
		const topGroup = groupsInReport.reduce<ReadinessGroupRow | null>(
			(current, group) =>
				!current || groupLowestAvailability(group) < groupLowestAvailability(current) ? group : current,
			null
		);
		const topCell = topGroup ? groupLowestCell(topGroup) : null;
		const totalPersonnel = groupsInReport.reduce((sum, group) => sum + (group.cells[0]?.totalPersonnel ?? 0), 0);
		const allCells = groupsInReport.flatMap((group) => group.cells);
		const lowCellCount = allCells.filter((cell) => cell.availablePercent < 80).length;
		const averageAvailability =
			allCells.length > 0
				? Math.round(allCells.reduce((sum, cell) => sum + cell.availablePercent, 0) / allCells.length)
				: 100;
		const emptyGroupCount = groupsInReport.filter((group) => (group.cells[0]?.totalPersonnel ?? 0) === 0).length;
		const lowestAvailability = topCell?.availablePercent ?? 100;

		return {
			topRisk:
				topGroup && topCell
					? `${topGroup.groupName} · ${topCell.availablePercent}% available on ${formatShortDate(topCell.date)}`
					: 'No groups in result',
			population: `${totalPersonnel} personnel across ${groupsInReport.length} groups`,
			parameters: `${startDate} to ${endDate}; ${report.result.dates.length} ${report.result.dates.length === 1 ? 'day' : 'days'}`,
			findings: [
				lowCellCount > 0
					? `${lowCellCount} group-day ${lowCellCount === 1 ? 'cell is' : 'cells are'} below 80% availability.`
					: 'All group-day cells are at or above 80% availability.',
				`${averageAvailability}% average availability across selected groups.`,
				emptyGroupCount > 0
					? `${emptyGroupCount} selected ${emptyGroupCount === 1 ? 'group has' : 'groups have'} no assigned personnel.`
					: 'All selected groups have assigned personnel.'
			],
			riskTone:
				lowestAvailability < 50
					? ('danger' as const)
					: lowestAvailability < 80
						? ('warning' as const)
						: ('success' as const)
		};
	});

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
		groupSort = groupSort === 'group-asc' ? 'group-desc' : 'group-asc';
	}

	function toggleRiskSort() {
		groupSort = groupSort === 'risk-asc' ? 'risk-desc' : 'risk-asc';
	}

	function sortByGroupRisk(a: ReadinessGroupRow, b: ReadinessGroupRow): number {
		const riskDifference = groupLowestAvailability(a) - groupLowestAvailability(b);
		return riskDifference === 0 ? sortByGroupName(a, b) : riskDifference;
	}

	function groupLowestAvailability(group: ReadinessGroupRow): number {
		return groupLowestCell(group)?.availablePercent ?? 100;
	}

	function groupLowestCell(group: ReadinessGroupRow) {
		return group.cells.reduce<ReadinessGroupRow['cells'][number] | null>(
			(current, cell) => (!current || cell.availablePercent < current.availablePercent ? cell : current),
			null
		);
	}

	function handleExportExcel() {
		if (!report.result) return;
		return exportGroupReadinessWorkbook(report.result, startDate, endDate);
	}
</script>

<ReportWorkspace.Root ariaLabel="Group availability by day report">
	<ReportWorkspace.Filters
		title="Build group availability report"
		description="Shows available personnel by group for each day in the range."
	>
		{#snippet dateRange()}
			<ReportWorkspace.DateRangeField
				bind:start={startDate}
				bind:end={endDate}
				presets={ReportWorkspace.WEEK_PRESETS}
			/>
		{/snippet}

		{#snippet actions()}
			<Button onclick={report.run} disabled={!report.canRun}>
				{report.status === 'loading' ? 'Checking group availability...' : 'Run group availability report'}
			</Button>
		{/snippet}

		<div class="min-w-0 space-y-2">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<span class="font-mono text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground"> Groups </span>
				<div class="flex items-center gap-2">
					<span class="text-xs text-muted-foreground">{groupSelect.count} of {groups.length} selected</span>
					<Button type="button" variant="ghost" size="xs" onclick={groupSelect.toggleAll}>
						{groupSelect.allSelected ? 'Clear' : 'Select all'}
					</Button>
				</div>
			</div>
			<ReportWorkspace.OptionList
				ariaLabel="Select groups"
				options={groupOptions}
				selectedIds={groupSelect.selectedIds}
				onToggle={groupSelect.toggle}
				emptyMessage="No groups available."
			/>
		</div>
	</ReportWorkspace.Filters>

	{#if report.status === 'loading'}
		<ReportWorkspace.State state="loading" title="Checking group availability" />
	{:else if report.status === 'error'}
		<ReportWorkspace.State
			state="error"
			title="Could not build group availability report"
			description={report.error ?? undefined}
			onRetry={report.run}
			retryLabel="Run again"
		/>
	{:else if report.result}
		<ReportWorkspace.Section
			title="Group availability by day"
			description="Each cell shows available personnel over total personnel for that group and date."
			meta={resultMeta}
		>
			{#snippet actions()}
				<ReportWorkspace.ExportAction label="Export group availability" onclick={handleExportExcel} />
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

			{#if report.result.groups.length === 0}
				<ReportWorkspace.State
					state="no-data"
					title="No group availability to report"
					description="No personnel are assigned to the selected groups for these dates."
				/>
			{:else}
				<div class="overflow-x-auto rounded-md border border-border">
					<table class="w-full border-collapse text-sm" aria-label="Group availability heat map">
						<thead class="bg-muted">
							<tr>
								<th
									class="min-w-36 border-b border-border px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase"
									aria-sort={groupSort === 'group-asc'
										? 'ascending'
										: groupSort === 'group-desc'
											? 'descending'
											: 'none'}
								>
									<button
										type="button"
										class="-mx-2 inline-flex min-h-8 max-w-full items-center rounded-sm px-2 text-left font-mono text-[0.6875rem] font-semibold tracking-[0.08em] uppercase [overflow-wrap:anywhere] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
										aria-label="Sort by group"
										onclick={toggleGroupSort}
									>
										Group
									</button>
								</th>
								<th
									class="min-w-24 border-b border-border px-3 py-2 text-center text-xs font-semibold text-muted-foreground uppercase"
									aria-sort={groupSort === 'risk-asc' ? 'ascending' : groupSort === 'risk-desc' ? 'descending' : 'none'}
								>
									<button
										type="button"
										class="inline-flex min-h-8 max-w-full items-center justify-center rounded-sm px-2 text-center font-mono text-[0.6875rem] font-semibold tracking-[0.08em] uppercase [overflow-wrap:anywhere] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
										aria-label="Sort by lowest availability"
										onclick={toggleRiskSort}
									>
										Lowest
									</button>
								</th>
								{#each report.result.dates as dateStr (dateStr)}
									<th
										class="min-w-20 border-b border-border px-3 py-2 text-center text-xs font-semibold text-muted-foreground uppercase [overflow-wrap:anywhere]"
									>
										{formatShortDate(dateStr)}
									</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each tableRows as group (group.groupId)}
								<tr>
									<td
										class="border-b border-border/60 px-3 py-2 font-semibold [overflow-wrap:anywhere]"
										title={group.groupName}
									>
										{group.groupName}
									</td>
									<td class="border-b border-border/60 px-3 py-2 text-center font-semibold tabular-nums">
										{groupLowestAvailability(group)}%
									</td>
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
