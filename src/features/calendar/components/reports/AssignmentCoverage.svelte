<script lang="ts">
	import type { AssignmentType, DailyAssignment, Personnel } from '$lib/types';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as ReportWorkspace from '$lib/components/ui/report-workspace/index.js';
	import type { ColumnDef } from '$lib/components/ui/data-table/index.js';
	import { useDataTable } from '$lib/components/ui/data-table/index.js';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import type { AssignmentCoverageResult, CoverageRow } from '../../utils/calendarReports';
	import { computeAssignmentCoverage } from '../../utils/calendarReports';
	import { exportAssignmentCoverageWorkbook } from './calendarReportWorkbookExport';
	import { fetchCalendarReportData } from './calendarReportData';

	interface Props {
		orgId: string;
		personnel: Personnel[];
		statusTypes: { id: string; name: string }[];
		groups: { id: string; name: string }[];
	}

	let { orgId, personnel }: Props = $props();

	const initialYearRange = ReportWorkspace.YEAR_PRESETS[0].getRange();
	let startDate = $state(initialYearRange.start);
	let endDate = $state(initialYearRange.end);
	let fetchedAssignmentTypes = $state<AssignmentType[]>([]);
	let rawAssignments = $state<DailyAssignment[]>([]);
	const selectedTypeIds = new SvelteSet<string>();

	const personnelAssignmentTypes = $derived(fetchedAssignmentTypes.filter((type) => type.assignTo === 'personnel'));
	const assignmentTypeChipOptions = $derived(
		personnelAssignmentTypes.map((type) => ({ id: type.id, label: type.name, color: type.color }))
	);
	const allTypesSelected = $derived(
		personnelAssignmentTypes.length > 0 && selectedTypeIds.size === personnelAssignmentTypes.length
	);

	const report = ReportWorkspace.createReportRun({
		validate: () => {
			if (!startDate || !endDate) return 'Select a date range.';
			return null;
		},
		load: () => fetchCalendarReportData(orgId, startDate, endDate),
		compute: (data): AssignmentCoverageResult => {
			const assignmentTypes = data.assignmentTypes ?? [];
			const assignments = data.assignments ?? [];
			fetchedAssignmentTypes = assignmentTypes;
			rawAssignments = assignments;
			selectedTypeIds.clear();
			for (const type of assignmentTypes.filter((item) => item.assignTo === 'personnel')) selectedTypeIds.add(type.id);
			return computeAssignmentCoverage(personnel, assignments, assignmentTypes, selectedTypeIds, startDate, endDate);
		}
	});

	const result = $derived.by(() => {
		if (!report.result) return null;
		return computeAssignmentCoverage(
			personnel,
			rawAssignments,
			fetchedAssignmentTypes,
			selectedTypeIds,
			startDate,
			endDate
		);
	});

	const displayTypes = $derived(
		result
			? result.activeAssignmentTypeIds
					.map((id) => personnelAssignmentTypes.find((type) => type.id === id))
					.filter((type): type is AssignmentType => !!type)
			: []
	);

	const averageByType = $derived.by(() => {
		if (!result || result.rows.length === 0) return new SvelteMap<string, number>();
		const map = new SvelteMap<string, number>();
		for (const typeId of result.activeAssignmentTypeIds) {
			const sum = result.rows.reduce((total, row) => total + (row.assignmentCounts.get(typeId) ?? 0), 0);
			map.set(typeId, Math.round((sum / result.rows.length) * 10) / 10);
		}
		return map;
	});

	const tableColumns = $derived.by<ColumnDef<CoverageRow>[]>(() => [
		{ key: 'rank', header: 'Rank', value: (row) => row.person.rank },
		{
			key: 'name',
			header: 'Name',
			value: (row) => `${row.person.lastName}, ${row.person.firstName}`,
			compare: (a, b) => a.person.lastName.localeCompare(b.person.lastName)
		},
		...displayTypes.map((assignmentType) => ({
			key: `assignment:${assignmentType.id}`,
			header: assignmentType.name,
			value: (row: CoverageRow) => row.assignmentCounts.get(assignmentType.id) ?? 0,
			searchable: false,
			sortable: false,
			align: 'center' as const
		})),
		{
			key: 'totalAssignments',
			header: 'Total',
			value: (row) => row.totalAssignments,
			compare: (a, b) => a.totalAssignments - b.totalAssignments,
			align: 'center'
		},
		{
			key: 'vsAvg',
			header: 'Difference from average',
			value: (row) => Math.round((row.totalAssignments - (result?.averageTotal ?? 0)) * 10) / 10,
			searchable: false,
			sortable: false,
			align: 'center'
		}
	]);

	const table = useDataTable({
		data: () => result?.rows ?? [],
		columns: () => tableColumns,
		initialSortKey: 'name'
	});

	const resultMeta = $derived(result ? `${result.rows.length} personnel · ${startDate} to ${endDate}` : '');

	function toggleTypeFilter(id: string) {
		if (selectedTypeIds.has(id)) selectedTypeIds.delete(id);
		else selectedTypeIds.add(id);
	}

	function toggleAllTypes() {
		if (selectedTypeIds.size === personnelAssignmentTypes.length) {
			selectedTypeIds.clear();
			return;
		}

		selectedTypeIds.clear();
		for (const type of personnelAssignmentTypes) selectedTypeIds.add(type.id);
	}

	function handleExportExcel() {
		if (!result) return;
		return exportAssignmentCoverageWorkbook(result, displayTypes, startDate, endDate);
	}
</script>

<ReportWorkspace.Root ariaLabel="Assignment load by person report">
	<ReportWorkspace.Filters
		title="Build assignment-load report"
		description="Counts personnel assignments and compares each person against the formation average."
	>
		{#snippet dateRange()}
			<ReportWorkspace.DateRangeField
				bind:start={startDate}
				bind:end={endDate}
				presets={ReportWorkspace.YEAR_PRESETS}
			/>
		{/snippet}

		{#snippet actions()}
			<Button onclick={report.run} disabled={!report.canRun}>
				{report.status === 'loading' ? 'Counting assignments...' : 'Run assignment-load report'}
			</Button>
		{/snippet}
	</ReportWorkspace.Filters>

	{#if report.status === 'loading'}
		<ReportWorkspace.State state="loading" title="Counting assignments" />
	{:else if report.status === 'error'}
		<ReportWorkspace.State
			state="error"
			title="Could not build assignment-load report"
			description={report.error ?? undefined}
			onRetry={report.run}
			retryLabel="Run again"
		/>
	{:else if result}
		{#if personnelAssignmentTypes.length > 0}
			<ReportWorkspace.Filters title="Assignment types to include">
				<ReportWorkspace.OptionChips
					ariaLabel="Filter assignment types"
					options={assignmentTypeChipOptions}
					selectedIds={selectedTypeIds}
					onToggle={toggleTypeFilter}
					onToggleAll={toggleAllTypes}
					allSelected={allTypesSelected}
				/>
			</ReportWorkspace.Filters>
		{/if}

		<ReportWorkspace.Table
			title="Assignment load by person"
			description="Positive numbers are above the average assignment count for the selected dates."
			meta={resultMeta}
			{table}
			columns={tableColumns}
			ariaLabel="Assignment load by person"
			emptyMessage="No personnel assignments fall in this date range. Try a wider date range."
		>
			{#snippet actions()}
				<ReportWorkspace.ExportAction label="Export assignment load" onclick={handleExportExcel} />
			{/snippet}

			{#snippet cell(row, column)}
				{#if column.key === 'rank'}
					{row.person.rank}
				{:else if column.key === 'name'}
					{row.person.lastName}, {row.person.firstName}
				{:else if column.key.startsWith('assignment:')}
					{column.value(row) || ''}
				{:else if column.key === 'totalAssignments'}
					{row.totalAssignments > 0 ? row.totalAssignments : ''}
				{:else if column.key === 'vsAvg'}
					{@const vsAvg = Number(column.value(row))}
					{#if vsAvg > 0}
						+{vsAvg}
					{:else if vsAvg < 0}
						{vsAvg}
					{:else}
						0
					{/if}
				{:else}
					{String(column.value(row) ?? '')}
				{/if}
			{/snippet}

			{#snippet footer()}
				<p class="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-label="Assignment coverage averages">
					<span>Average assignments</span>
					{#each displayTypes as assignmentType (assignmentType.id)}
						<span class="min-w-0 [overflow-wrap:anywhere]">
							{assignmentType.name}: {averageByType.get(assignmentType.id) ?? 0}
						</span>
					{/each}
					<span>Total: {result.averageTotal}</span>
				</p>
			{/snippet}
		</ReportWorkspace.Table>
	{/if}
</ReportWorkspace.Root>
