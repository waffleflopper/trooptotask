<script lang="ts">
	import type { Personnel, StatusType } from '$lib/types';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as ReportWorkspace from '$lib/components/ui/report-workspace/index.js';
	import type { ColumnDef } from '$lib/components/ui/data-table/index.js';
	import { useDataTable } from '$lib/components/ui/data-table/index.js';
	import type { PersonnelTempoResult, TempoRow } from '../../utils/calendarReports';
	import { computePersonnelTempo } from '../../utils/calendarReports';
	import { exportPersonnelTempoWorkbook } from './calendarReportWorkbookExport';
	import { fetchCalendarReportData } from './calendarReportData';

	interface Props {
		orgId: string;
		personnel: Personnel[];
		statusTypes: StatusType[];
		groups: { id: string; name: string }[];
	}

	let { orgId, personnel, statusTypes }: Props = $props();

	function daysAgo(days: number): string {
		const today = new Date();
		return ReportWorkspace.formatLocalDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - days));
	}

	const tempoPresets: ReportWorkspace.DateRangePreset[] = [
		{
			id: 'past-90',
			label: 'Past 90 Days',
			getRange: () => ({ start: daysAgo(90), end: ReportWorkspace.formatLocalDate(new Date()) })
		},
		{
			id: 'past-180',
			label: 'Past 180 Days',
			getRange: () => ({ start: daysAgo(180), end: ReportWorkspace.formatLocalDate(new Date()) })
		},
		{
			id: 'past-365',
			label: 'Past 365 Days',
			getRange: () => ({ start: daysAgo(365), end: ReportWorkspace.formatLocalDate(new Date()) })
		}
	];

	const initialRange = tempoPresets[0].getRange();
	let startDate = $state(initialRange.start);
	let endDate = $state(initialRange.end);
	let threshold = $state(90);

	const awayStatusSelect = ReportWorkspace.createMultiSelect(() => statusTypes);
	const statusTypeMap = $derived(new Map(statusTypes.map((statusType) => [statusType.id, statusType])));
	const statusChipOptions = $derived(
		statusTypes.map((statusType) => ({ id: statusType.id, label: statusType.name, color: statusType.color }))
	);

	const report = ReportWorkspace.createReportRun({
		validate: () => {
			if (!startDate || !endDate) return 'Select a date range.';
			if (awayStatusSelect.count === 0) return 'Select at least one away status.';
			return null;
		},
		load: () => fetchCalendarReportData(orgId, startDate, endDate),
		compute: (data): PersonnelTempoResult => {
			const entries = data.entries.filter((entry) => awayStatusSelect.has(entry.statusTypeId));
			return computePersonnelTempo(
				personnel,
				entries,
				awayStatusSelect.selectedIds as Set<string>,
				startDate,
				endDate,
				threshold
			);
		}
	});

	const displayColumns = $derived(
		report.result
			? report.result.activeStatusTypeIds
					.map((id) => statusTypeMap.get(id))
					.filter((status): status is StatusType => !!status)
			: []
	);

	const tableColumns = $derived.by<ColumnDef<TempoRow>[]>(() => [
		{ key: 'rank', header: 'Rank', value: (row) => row.person.rank },
		{
			key: 'name',
			header: 'Name',
			value: (row) => `${row.person.lastName}, ${row.person.firstName}`,
			compare: (a, b) => a.person.lastName.localeCompare(b.person.lastName)
		},
		...displayColumns.map((statusType) => ({
			key: `status:${statusType.id}`,
			header: statusType.name,
			value: (row: TempoRow) => row.awayByStatus.get(statusType.id) ?? 0,
			searchable: false,
			sortable: false,
			align: 'center' as const
		})),
		{
			key: 'totalAway',
			header: 'Total away days',
			value: (row) => row.totalAwayDays,
			compare: (a, b) => a.totalAwayDays - b.totalAwayDays,
			align: 'center'
		},
		{
			key: 'percentAway',
			header: 'Away percent',
			value: (row) => row.percentAway,
			compare: (a, b) => a.percentAway - b.percentAway,
			align: 'center'
		}
	]);

	const table = useDataTable({
		data: () => report.result?.rows ?? [],
		columns: () => tableColumns,
		initialSortKey: 'name'
	});

	const resultMeta = $derived(
		report.result ? `${report.result.rows.length} personnel · ${startDate} to ${endDate}` : ''
	);

	function handleExportExcel() {
		if (!report.result) return;
		return exportPersonnelTempoWorkbook(report.result, displayColumns, startDate, endDate);
	}
</script>

<ReportWorkspace.Root ariaLabel="Away days by person report">
	<ReportWorkspace.Filters
		title="Build away-days report"
		description="Counts time away from the formation using the selected calendar statuses."
	>
		{#snippet dateRange()}
			<ReportWorkspace.DateRangeField bind:start={startDate} bind:end={endDate} presets={tempoPresets} />
		{/snippet}

		{#snippet actions()}
			<Button onclick={report.run} disabled={!report.canRun}>
				{report.status === 'loading' ? 'Counting away days...' : 'Run away-days report'}
			</Button>
		{/snippet}

		<ReportWorkspace.OptionChips
			label="Away status types"
			ariaLabel="Select away status types"
			options={statusChipOptions}
			selectedIds={awayStatusSelect.selectedIds}
			onToggle={awayStatusSelect.toggle}
			onToggleAll={awayStatusSelect.toggleAll}
			allSelected={awayStatusSelect.allSelected}
		/>

		<div class="min-w-0 space-y-2">
			<span class="font-mono text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
				Flag when away days exceed
			</span>
			<Input type="number" bind:value={threshold} min={1} aria-label="Flag personnel when away days exceed" />
			<p class="text-xs text-muted-foreground">Rows above this number are marked in red.</p>
		</div>
	</ReportWorkspace.Filters>

	{#if report.status === 'loading'}
		<ReportWorkspace.State state="loading" title="Counting away days" />
	{:else if report.status === 'error'}
		<ReportWorkspace.State
			state="error"
			title="Could not build away-days report"
			description={report.error ?? undefined}
		/>
	{:else if report.result}
		<ReportWorkspace.Table
			title="Away days by person"
			description="Use this to spot personnel with sustained time away from normal availability."
			meta={resultMeta}
			{table}
			columns={tableColumns}
			ariaLabel="Away days by person"
			emptyMessage="No selected away statuses fall in this date range. Try more statuses or a wider range."
		>
			{#snippet actions()}
				<ReportWorkspace.ExportAction label="Export away days" onclick={handleExportExcel} />
			{/snippet}

			{#snippet cell(row, column)}
				{#if column.key === 'rank'}
					{row.person.rank}
				{:else if column.key === 'name'}
					{row.person.lastName}, {row.person.firstName}
				{:else if column.key === 'percentAway'}
					<span class={row.flagged ? 'font-semibold text-destructive' : ''}>{row.percentAway}%</span>
				{:else}
					{String(column.value(row) ?? '')}
				{/if}
			{/snippet}
		</ReportWorkspace.Table>
	{/if}
</ReportWorkspace.Root>
