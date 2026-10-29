<script lang="ts">
	import type { ToolbarAction } from '$lib/components/patterns/workspace-toolbar';
	import type { Group, Personnel } from '$features/personnel/contracts';
	import type { StatusType } from '$features/calendar/contracts';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as ReportWorkspace from '$lib/components/patterns/report-workspace/index.js';
	import type { ColumnDef } from '$lib/components/ui/data-table/index.js';
	import { useDataTable } from '$lib/components/ui/data-table/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import type { GroupReadinessResult, ReadinessGroupRow } from '../../utils/calendarReports';
	import { computeGroupReadiness } from '../../utils/calendarReports';
	import { exportGroupReadinessWorkbook } from './calendarReportWorkbookExport';
	import { fetchCalendarReportData } from './calendarReportData';

	interface Props {
		orgId: string;
		personnel: Personnel[];
		statusTypes: StatusType[];
		groups: Group[];
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

	const tableColumns = $derived<ColumnDef<ReadinessGroupRow>[]>([
		{
			key: 'group',
			header: 'Group',
			headerAriaLabel: 'Sort by group',
			value: (group) => group.groupName,
			compare: sortByGroupName
		},
		{
			key: 'lowest',
			header: 'Lowest',
			headerAriaLabel: 'Sort by lowest availability',
			value: groupLowestAvailability,
			compare: sortByGroupRisk,
			align: 'center'
		},
		...(report.result?.dates ?? []).map(
			(dateStr, index): ColumnDef<ReadinessGroupRow> => ({
				key: dateStr,
				header: formatShortDate(dateStr),
				value: (group) => group.cells[index]?.availablePercent,
				sortable: false,
				align: 'center'
			})
		)
	]);
	const table = useDataTable({
		data: () => report.result?.groups ?? [],
		columns: () => tableColumns,
		initialSortKey: 'lowest',
		initialSortDirection: 'asc',
		rowKey: (group) => group.groupId
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

	function cellTone(percent: number): string {
		if (percent >= 80) return 'bg-success/15';
		if (percent >= 50) return 'bg-warning/15';
		return 'bg-destructive/15';
	}

	function sortByGroupName(a: ReadinessGroupRow, b: ReadinessGroupRow): number {
		return a.groupName.localeCompare(b.groupName);
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
		return exportGroupReadinessWorkbook(report.result, groups, startDate, endDate);
	}

	const readyExport = $derived<ToolbarAction | undefined>(
		report.result && report.status !== 'loading' && report.status !== 'error'
			? {
					kind: 'action',
					id: 'export',
					label: 'Export group availability',
					icon: 'download',
					onclick: handleExportExcel
				}
			: undefined
	);

	export function exportAction(): ToolbarAction | undefined {
		return readyExport;
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
		<ReportWorkspace.Table
			title="Group availability by day"
			description="Each cell shows available personnel over total personnel for that group and date."
			meta={resultMeta}
			{table}
			columns={tableColumns}
			ariaLabel="Group availability heat map"
			emptyMessage="No group availability to report."
		>
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

			{#snippet row(group)}
				<Table.Row>
					<Table.Cell class="font-semibold" title={group.groupName}>{group.groupName}</Table.Cell>
					<Table.Cell class="text-center font-semibold tabular-nums">{groupLowestAvailability(group)}%</Table.Cell>
					{#each group.cells as cell (cell.date)}
						<Table.Cell class={['text-center tabular-nums', cellTone(cell.availablePercent)]}>
							{cell.availableCount}/{cell.totalPersonnel}
						</Table.Cell>
					{/each}
				</Table.Row>
			{/snippet}
		</ReportWorkspace.Table>
	{/if}
</ReportWorkspace.Root>
