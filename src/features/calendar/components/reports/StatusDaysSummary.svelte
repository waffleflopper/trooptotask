<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { StatusType } from '$lib/types';
	import type { StatusDaysResult, StatusDayRow } from '../../utils/statusDaysReport';
	import { computeStatusDays } from '../../utils/statusDaysReport';
	import { exportStatusDaysWorkbook } from './calendarReportWorkbookExport';
	import { Button } from '$lib/components/ui/button';
	import * as DataTable from '$lib/components/ui/data-table';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { useDataTable } from '$lib/components/ui/data-table';
	import type { ColumnDef } from '$lib/components/ui/data-table';
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';

	interface Props {
		orgId: string;
		personnel: Personnel[];
		statusTypes: StatusType[];
		groups: { id: string; name: string }[];
	}

	let { orgId, personnel, statusTypes, groups }: Props = $props();

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

	// --- Personnel filter state ---
	type FilterMode = 'all' | 'name' | 'group' | 'mos' | 'role';
	let filterMode = $state<FilterMode>('all');
	const selectedPersonnelIds = new SvelteSet<string>();
	const selectedGroupIds = new SvelteSet<string>();
	const selectedMosCodes = new SvelteSet<string>();
	const selectedRoles = new SvelteSet<string>();
	let nameSearch = $state('');

	const uniqueMosCodes = $derived([...new Set(personnel.map((p) => p.mos).filter(Boolean))].sort());
	const uniqueRoles = $derived([...new Set(personnel.map((p) => p.clinicRole).filter(Boolean))].sort());

	const filteredPersonnel = $derived.by(() => {
		switch (filterMode) {
			case 'all':
				return personnel;
			case 'name':
				return personnel.filter((p) => selectedPersonnelIds.has(p.id));
			case 'group':
				return personnel.filter((p) => p.groupId && selectedGroupIds.has(p.groupId));
			case 'mos':
				return personnel.filter((p) => selectedMosCodes.has(p.mos));
			case 'role':
				return personnel.filter((p) => selectedRoles.has(p.clinicRole));
			default:
				return personnel;
		}
	});

	const nameFilteredPersonnel = $derived(
		nameSearch
			? personnel.filter((p) =>
					`${p.rank} ${p.lastName} ${p.firstName}`.toLowerCase().includes(nameSearch.toLowerCase())
				)
			: personnel
	);

	// --- Status type filter state ---
	const selectedStatusTypeIds = new SvelteSet<string>();
	let previousStatusTypeIds: string[] = [];

	$effect(() => {
		const currentStatusTypeIds = statusTypes.map((s) => s.id);
		const currentStatusTypeIdSet = new SvelteSet(currentStatusTypeIds);

		untrack(() => {
			const selectedAllPrevious =
				previousStatusTypeIds.length > 0 && previousStatusTypeIds.every((id) => selectedStatusTypeIds.has(id));
			const shouldSelectAll =
				(previousStatusTypeIds.length === 0 && selectedStatusTypeIds.size === 0) || selectedAllPrevious;

			if (shouldSelectAll) {
				selectedStatusTypeIds.clear();
				for (const id of currentStatusTypeIds) selectedStatusTypeIds.add(id);
			} else {
				const selectedExistingIds = [...selectedStatusTypeIds].filter((id) => currentStatusTypeIdSet.has(id));
				if (selectedExistingIds.length !== selectedStatusTypeIds.size) {
					selectedStatusTypeIds.clear();
					for (const id of selectedExistingIds) selectedStatusTypeIds.add(id);
				}
			}

			previousStatusTypeIds = currentStatusTypeIds;
		});
	});

	function toggleAllStatuses() {
		if (selectedStatusTypeIds.size === statusTypes.length) {
			selectedStatusTypeIds.clear();
		} else {
			selectedStatusTypeIds.clear();
			for (const statusType of statusTypes) selectedStatusTypeIds.add(statusType.id);
		}
	}

	// --- Report execution ---
	let loading = $state(false);
	let result = $state<StatusDaysResult | null>(null);
	let errorMsg = $state('');

	async function runReport() {
		if (!startDate || !endDate) return;
		if (filteredPersonnel.length === 0) {
			errorMsg = 'No personnel selected.';
			result = null;
			return;
		}

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
			// Filter entries to only selected status types
			const filteredEntries =
				selectedStatusTypeIds.size === statusTypes.length
					? data.entries
					: data.entries.filter((e: Record<string, unknown>) => selectedStatusTypeIds.has(e.statusTypeId as string));
			result = computeStatusDays(filteredPersonnel, filteredEntries, startDate, endDate);
		} catch (e: unknown) {
			errorMsg = e instanceof Error ? e.message : 'Failed to generate report.';
		} finally {
			loading = false;
		}
	}

	function handleExportExcel() {
		if (!result) return;
		return exportStatusDaysWorkbook(result, statusTypes, startDate, endDate);
	}

	function toggleSet<T>(set: SvelteSet<T>, value: T): void {
		if (set.has(value)) set.delete(value);
		else set.add(value);
	}

	const statusTypeMap = $derived(new Map(statusTypes.map((s) => [s.id, s])));

	const displayColumns = $derived(
		result ? result.activeStatusTypeIds.map((id) => statusTypeMap.get(id)).filter((s): s is StatusType => !!s) : []
	);

	// --- useDataTable for sorting ---
	const columns = $derived.by<ColumnDef<StatusDayRow>[]>(() => [
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
		...displayColumns.map((statusType) => ({
			key: `status:${statusType.id}`,
			header: statusType.name,
			value: (r: StatusDayRow) => r.statusDays.get(statusType.id) ?? 0,
			searchable: false,
			sortable: false,
			align: 'center' as const
		})),
		{
			key: 'totalDays',
			header: 'Total Days',
			value: (r) => r.totalDays,
			compare: (a, b) => a.totalDays - b.totalDays,
			align: 'center'
		}
	]);

	const table = useDataTable({
		data: () => result?.rows ?? [],
		columns: () => columns,
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

	<div class="config-section">
		<h3>Personnel</h3>
		<div class="filter-mode-row">
			<Field.Root>
				<Field.Label>Filter by</Field.Label>
				<NativeSelect bind:value={filterMode}>
					<option value="all">All Personnel</option>
					<option value="name">By Name</option>
					<option value="group">By Group</option>
					{#if uniqueMosCodes.length > 0}
						<option value="mos">By MOS</option>
					{/if}
					{#if uniqueRoles.length > 0}
						<option value="role">By Duty Role</option>
					{/if}
				</NativeSelect>
			</Field.Root>
		</div>

		{#if filterMode === 'name'}
			<div class="filter-panel">
				<Input type="text" placeholder="Search by name..." bind:value={nameSearch} />
				<div class="checkbox-list">
					{#each nameFilteredPersonnel as person (person.id)}
						<label class="checkbox-item">
							<input
								type="checkbox"
								checked={selectedPersonnelIds.has(person.id)}
								onchange={() => toggleSet(selectedPersonnelIds, person.id)}
							/>
							<span>{person.rank} {person.lastName}, {person.firstName}</span>
						</label>
					{/each}
				</div>
			</div>
		{:else if filterMode === 'group'}
			<div class="filter-panel">
				<div class="checkbox-list">
					{#each groups as group (group.id)}
						<label class="checkbox-item">
							<input
								type="checkbox"
								checked={selectedGroupIds.has(group.id)}
								onchange={() => toggleSet(selectedGroupIds, group.id)}
							/>
							<span>{group.name}</span>
						</label>
					{/each}
				</div>
			</div>
		{:else if filterMode === 'mos'}
			<div class="filter-panel">
				<div class="checkbox-list">
					{#each uniqueMosCodes as mos (mos)}
						<label class="checkbox-item">
							<input
								type="checkbox"
								checked={selectedMosCodes.has(mos)}
								onchange={() => toggleSet(selectedMosCodes, mos)}
							/>
							<span>{mos}</span>
						</label>
					{/each}
				</div>
			</div>
		{:else if filterMode === 'role'}
			<div class="filter-panel">
				<div class="checkbox-list">
					{#each uniqueRoles as role (role)}
						<label class="checkbox-item">
							<input
								type="checkbox"
								checked={selectedRoles.has(role)}
								onchange={() => toggleSet(selectedRoles, role)}
							/>
							<span>{role}</span>
						</label>
					{/each}
				</div>
			</div>
		{/if}

		<div class="personnel-count">
			{filteredPersonnel.length} of {personnel.length} personnel selected
		</div>
	</div>

	<div class="config-section">
		<h3>Status Types</h3>
		<div class="status-filter-header">
			<Button variant="outline" size="sm" onclick={toggleAllStatuses}>
				{selectedStatusTypeIds.size === statusTypes.length ? 'Deselect All' : 'Select All'}
			</Button>
			<span class="personnel-count">
				{selectedStatusTypeIds.size} of {statusTypes.length} selected
			</span>
		</div>
		<div class="status-chips">
			{#each statusTypes as st (st.id)}
				<button
					class="status-chip"
					class:selected={selectedStatusTypeIds.has(st.id)}
					style:--chip-color={st.color}
					style:--chip-text={st.textColor}
					onclick={() => toggleSet(selectedStatusTypeIds, st.id)}
				>
					{st.name}
				</button>
			{/each}
		</div>
	</div>

	<div class="config-actions">
		<Button onclick={runReport} disabled={loading || !startDate || !endDate || selectedStatusTypeIds.size === 0}>
			{#if loading}<Spinner />{/if}
			{loading ? 'Generating...' : 'Generate Report'}
		</Button>
	</div>
</div>

{#if errorMsg}
	<div class="report-error">{errorMsg}</div>
{/if}

{#if result}
	<div class="report-output">
		<div class="report-toolbar">
			<span class="report-summary">
				{result.rows.length} personnel &middot; {startDate} to {endDate}
			</span>
			<Button variant="outline" size="sm" onclick={handleExportExcel}>Export Excel</Button>
		</div>

		{#if result.rows.length === 0}
			<p class="no-data">No data found for the selected criteria.</p>
		{:else}
			<DataTable.DataTable
				{table}
				{columns}
				ariaLabel="Status days summary"
				compact
				striped
				emptyMessage="No data found for the selected criteria."
			>
				{#snippet cell(row, column)}
					{#if column.key === 'rank'}
						{row.person.rank}
					{:else if column.key === 'name'}
						{row.person.lastName}, {row.person.firstName}
					{:else if column.key.startsWith('status:')}
						{Number(column.value(row)) > 0 ? column.value(row) : ''}
					{:else if column.key === 'totalDays'}
						{row.totalDays > 0 ? row.totalDays : ''}
					{:else}
						{String(column.value(row) ?? '')}
					{/if}
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

	.filter-mode-row {
		margin-bottom: 0.5rem;
	}

	.filter-panel {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.checkbox-list {
		max-height: 200px;
		overflow-y: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.25rem;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.checkbox-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.5rem;
		border-radius: var(--radius);
		font-size: 0.75rem;
		cursor: pointer;
	}

	.checkbox-item:hover {
		background: var(--background);
	}

	.personnel-count {
		font-size: 0.75rem;
		color: var(--muted-foreground);
		margin-top: 0.25rem;
	}

	.status-filter-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.status-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.status-chip {
		padding: 0.25rem 0.5rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		cursor: pointer;
		border: 2px solid var(--chip-color);
		background: transparent;
		color: var(--foreground);
		transition: all 0.15s ease;
	}

	.status-chip.selected {
		background: var(--chip-color);
		color: var(--chip-text);
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
