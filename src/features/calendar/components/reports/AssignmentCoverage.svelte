<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { AssignmentType, DailyAssignment } from '$lib/types';
	import type { AssignmentCoverageResult, CoverageRow } from '../../utils/calendarReports';
	import { computeAssignmentCoverage } from '../../utils/calendarReports';
	import { exportAssignmentCoverageWorkbook } from './calendarReportWorkbookExport';
	import { Button } from '$lib/components/ui/button';
	import * as DataTable from '$lib/components/ui/data-table';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { useDataTable } from '$lib/components/ui/data-table';
	import type { ColumnDef } from '$lib/components/ui/data-table';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';

	interface Props {
		orgId: string;
		personnel: Personnel[];
		statusTypes: { id: string; name: string }[];
		groups: { id: string; name: string }[];
	}

	let { orgId, personnel }: Props = $props();

	// --- Date range state ---
	const currentYear = new Date().getFullYear();
	const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

	let selectedYear = $state<number | null>(currentYear);
	let startDate = $state(`${currentYear}-01-01`);
	let endDate = $state(`${currentYear}-12-31`);

	function handleYearChange(year: number | null) {
		selectedYear = year;
		if (year) {
			startDate = `${year}-01-01`;
			endDate = `${year}-12-31`;
		}
	}

	function handleDateChange() {
		selectedYear = null;
	}

	// --- Report execution ---
	let loading = $state(false);
	let result = $state<AssignmentCoverageResult | null>(null);
	let errorMsg = $state('');
	let fetchedAssignmentTypes = $state<AssignmentType[]>([]);
	const selectedTypeIds = new SvelteSet<string>();

	// Keep a reference to raw data so we can re-compute on filter change
	let rawAssignments = $state<DailyAssignment[]>([]);

	const personnelAssignmentTypes = $derived(fetchedAssignmentTypes.filter((t) => t.assignTo === 'personnel'));

	const displayTypes = $derived(
		result
			? result.activeAssignmentTypeIds
					.map((id) => personnelAssignmentTypes.find((t) => t.id === id))
					.filter((t): t is AssignmentType => !!t)
			: []
	);

	const averageByType = $derived.by(() => {
		if (!result || result.rows.length === 0) return new SvelteMap<string, number>();
		const map = new SvelteMap<string, number>();
		for (const typeId of result.activeAssignmentTypeIds) {
			const sum = result.rows.reduce((s, r) => s + (r.assignmentCounts.get(typeId) ?? 0), 0);
			map.set(typeId, Math.round((sum / result.rows.length) * 10) / 10);
		}
		return map;
	});

	async function runReport() {
		if (!startDate || !endDate) return;

		loading = true;
		errorMsg = '';
		result = null;

		try {
			const res = await fetch(
				`/org/${orgId}/api/calendar-reports/status-days?startDate=${startDate}&endDate=${endDate}`
			);
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message || `Request failed (${res.status})`);
			}
			const data = await res.json();

			const types: AssignmentType[] = data.assignmentTypes ?? [];
			const personnelTypes = types.filter((t) => t.assignTo === 'personnel');
			fetchedAssignmentTypes = types;
			rawAssignments = data.assignments ?? [];

			// Default all personnel assignment types selected
			selectedTypeIds.clear();
			for (const type of personnelTypes) selectedTypeIds.add(type.id);

			result = computeAssignmentCoverage(
				personnel,
				rawAssignments,
				fetchedAssignmentTypes,
				selectedTypeIds,
				startDate,
				endDate
			);
		} catch (e: unknown) {
			errorMsg = e instanceof Error ? e.message : 'Failed to generate report.';
		} finally {
			loading = false;
		}
	}

	function recompute() {
		if (rawAssignments.length === 0 && fetchedAssignmentTypes.length === 0) return;
		result = computeAssignmentCoverage(
			personnel,
			rawAssignments,
			fetchedAssignmentTypes,
			selectedTypeIds,
			startDate,
			endDate
		);
	}

	function toggleTypeFilter(id: string) {
		if (selectedTypeIds.has(id)) selectedTypeIds.delete(id);
		else selectedTypeIds.add(id);
		recompute();
	}

	function toggleAllTypes() {
		if (selectedTypeIds.size === personnelAssignmentTypes.length) {
			selectedTypeIds.clear();
		} else {
			selectedTypeIds.clear();
			for (const type of personnelAssignmentTypes) selectedTypeIds.add(type.id);
		}
		recompute();
	}

	function handleExportExcel() {
		if (!result) return;
		return exportAssignmentCoverageWorkbook(result, displayTypes, startDate, endDate);
	}

	const tableColumns = $derived.by<ColumnDef<CoverageRow>[]>(() => [
		{
			key: 'rank',
			header: 'Rank',
			value: (r) => r.person.rank
		},
		{
			key: 'name',
			header: 'Name',
			value: (r) => `${r.person.lastName}, ${r.person.firstName}`,
			compare: (a, b) => a.person.lastName.localeCompare(b.person.lastName)
		},
		...displayTypes.map((assignmentType) => ({
			key: `assignment:${assignmentType.id}`,
			header: assignmentType.name,
			value: (r: CoverageRow) => r.assignmentCounts.get(assignmentType.id) ?? 0,
			searchable: false,
			sortable: false,
			align: 'center' as const
		})),
		{
			key: 'totalAssignments',
			header: 'Total',
			value: (r) => r.totalAssignments,
			compare: (a, b) => a.totalAssignments - b.totalAssignments,
			align: 'center'
		},
		{
			key: 'vsAvg',
			header: 'vs Avg',
			value: (r) => Math.round((r.totalAssignments - (result?.averageTotal ?? 0)) * 10) / 10,
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
</script>

<div class="report-config">
	<div class="config-section">
		<h3>Date Range</h3>
		<div class="date-row">
			<Field.Root>
				<Field.Label>Year</Field.Label>
				<NativeSelect
					value={selectedYear ?? ''}
					onchange={(e) => {
						const val = e.currentTarget.value;
						handleYearChange(val ? Number(val) : null);
					}}
				>
					<option value="">Custom</option>
					{#each yearOptions as year (year)}
						<option value={year}>{year}</option>
					{/each}
				</NativeSelect>
			</Field.Root>
			<Field.Root>
				<Field.Label>Start</Field.Label>
				<DatePicker bind:value={startDate} onValueChange={handleDateChange} placeholder="Select start date" />
			</Field.Root>
			<Field.Root>
				<Field.Label>End</Field.Label>
				<DatePicker bind:value={endDate} onValueChange={handleDateChange} placeholder="Select end date" />
			</Field.Root>
		</div>
	</div>

	<div class="config-actions">
		<Button onclick={runReport} disabled={loading || !startDate || !endDate}>
			{#if loading}<Spinner />{/if}
			{loading ? 'Generating...' : 'Generate Report'}
		</Button>
	</div>
</div>

{#if errorMsg}
	<div class="report-error">{errorMsg}</div>
{/if}

{#if result}
	{#if personnelAssignmentTypes.length > 0}
		<div class="type-filter">
			<div class="type-filter-header">
				<h3>Assignment Types</h3>
				<Button variant="outline" size="sm" onclick={toggleAllTypes}>
					{selectedTypeIds.size === personnelAssignmentTypes.length ? 'Deselect All' : 'Select All'}
				</Button>
				<span class="filter-count">
					{selectedTypeIds.size} of {personnelAssignmentTypes.length} selected
				</span>
			</div>
			<div class="type-chips">
				{#each personnelAssignmentTypes as at (at.id)}
					<button
						class="type-chip"
						class:selected={selectedTypeIds.has(at.id)}
						style:--chip-color={at.color}
						onclick={() => toggleTypeFilter(at.id)}
					>
						{at.name}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<div class="report-output">
		<div class="report-toolbar">
			<span class="report-summary">
				{result.rows.length} personnel &middot; {startDate} to {endDate}
			</span>
			<Button variant="outline" size="sm" onclick={handleExportExcel}>Export Excel</Button>
		</div>

		{#if result.rows.length === 0 || displayTypes.length === 0}
			<p class="no-data">No assignment data found for the selected criteria.</p>
		{:else}
			<DataTable.DataTable
				{table}
				columns={tableColumns}
				ariaLabel="Assignment coverage report"
				compact
				striped
				emptyMessage="No assignment data found for the selected criteria."
			>
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
					<p aria-label="Assignment coverage averages">
						Average
						{#each displayTypes as at (at.id)}
							<span>{at.name}: {averageByType.get(at.id) ?? 0}</span>
						{/each}
						<span>Total: {result?.averageTotal ?? 0}</span>
					</p>
				{/snippet}
			</DataTable.DataTable>
		{/if}
	</div>
{/if}

<style>
	.report-config {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.config-section h3 {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--muted-foreground);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0 0 0.5rem 0;
	}

	.date-row {
		display: flex;
		gap: 0.5rem;
		align-items: flex-end;
		flex-wrap: wrap;
	}

	.config-actions {
		display: flex;
		justify-content: flex-end;
	}

	.report-error {
		color: var(--destructive);
		font-size: 0.75rem;
		padding: 0.5rem;
		background: color-mix(in srgb, var(--destructive) 10%, transparent);
		border-radius: var(--radius);
		margin-top: 0.5rem;
	}

	.type-filter {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1rem;
		margin-top: 1rem;
	}

	.type-filter-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.type-filter-header h3 {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--muted-foreground);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0;
	}

	.filter-count {
		font-size: 0.75rem;
		color: var(--muted-foreground);
		margin-left: auto;
	}

	.type-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.type-chip {
		padding: 0.25rem 0.5rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		cursor: pointer;
		border: 2px solid var(--chip-color);
		background: transparent;
		color: var(--foreground);
		transition: all 0.15s ease;
	}

	.type-chip.selected {
		background: var(--chip-color);
		color: white;
	}

	.report-output {
		margin-top: 1rem;
	}

	.report-toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.report-summary {
		font-size: 0.75rem;
		color: var(--muted-foreground);
	}

	.no-data {
		text-align: center;
		color: var(--muted-foreground);
		padding: 2rem;
		font-style: italic;
	}

	@media (max-width: 640px) {
		.date-row {
			flex-direction: column;
		}
	}
</style>
