<script lang="ts">
	import type { Personnel, StatusType } from '$lib/types';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import * as ReportWorkspace from '$lib/components/ui/report-workspace/index.js';
	import type { ColumnDef } from '$lib/components/ui/data-table/index.js';
	import { useDataTable } from '$lib/components/ui/data-table/index.js';
	import { SvelteSet } from 'svelte/reactivity';
	import type { StatusDaysResult, StatusDayRow } from '../../utils/statusDaysReport';
	import { computeStatusDays } from '../../utils/statusDaysReport';
	import { exportStatusDaysWorkbook } from './calendarReportWorkbookExport';
	import { fetchCalendarReportData } from './calendarReportData';

	interface Props {
		orgId: string;
		personnel: Personnel[];
		statusTypes: StatusType[];
		groups: { id: string; name: string }[];
	}

	let { orgId, personnel, statusTypes, groups }: Props = $props();

	type FilterMode = 'all' | 'name' | 'group' | 'mos' | 'role';

	const initialYearRange = ReportWorkspace.YEAR_PRESETS[0].getRange();
	let startDate = $state(initialYearRange.start);
	let endDate = $state(initialYearRange.end);
	let filterMode = $state<FilterMode>('all');
	let nameSearch = $state('');

	const selectedPersonnelIds = new SvelteSet<string>();
	const selectedGroupIds = new SvelteSet<string>();
	const selectedMosCodes = new SvelteSet<string>();
	const selectedRoles = new SvelteSet<string>();
	const statusSelect = ReportWorkspace.createMultiSelect(() => statusTypes);

	const uniqueMosCodes = $derived([...new Set(personnel.map((p) => p.mos).filter(Boolean))].sort());
	const uniqueRoles = $derived([...new Set(personnel.map((p) => p.clinicRole).filter(Boolean))].sort());
	const statusTypeMap = $derived(new Map(statusTypes.map((statusType) => [statusType.id, statusType])));

	const filteredPersonnel = $derived.by(() => {
		switch (filterMode) {
			case 'name':
				return personnel.filter((person) => selectedPersonnelIds.has(person.id));
			case 'group':
				return personnel.filter((person) => person.groupId && selectedGroupIds.has(person.groupId));
			case 'mos':
				return personnel.filter((person) => selectedMosCodes.has(person.mos));
			case 'role':
				return personnel.filter((person) => selectedRoles.has(person.clinicRole));
			default:
				return personnel;
		}
	});

	const nameFilteredPersonnel = $derived(
		nameSearch
			? personnel.filter((person) =>
					`${person.rank} ${person.lastName} ${person.firstName}`.toLowerCase().includes(nameSearch.toLowerCase())
				)
			: personnel
	);

	const report = ReportWorkspace.createReportRun({
		validate: () => {
			if (!startDate || !endDate) return 'Select a date range.';
			if (filteredPersonnel.length === 0) return 'No personnel selected.';
			if (statusSelect.count === 0) return 'Select at least one status type.';
			return null;
		},
		load: () => fetchCalendarReportData(orgId, startDate, endDate),
		compute: (data): StatusDaysResult => {
			const entries =
				statusSelect.count === statusTypes.length
					? data.entries
					: data.entries.filter((entry) => statusSelect.has(entry.statusTypeId));
			return computeStatusDays(filteredPersonnel, entries, startDate, endDate);
		}
	});

	const displayColumns = $derived(
		report.result
			? report.result.activeStatusTypeIds
					.map((id) => statusTypeMap.get(id))
					.filter((status): status is StatusType => !!status)
			: []
	);

	const tableColumns = $derived.by<ColumnDef<StatusDayRow>[]>(() => [
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
			value: (row: StatusDayRow) => row.statusDays.get(statusType.id) ?? 0,
			searchable: false,
			sortable: false,
			align: 'center' as const
		})),
		{
			key: 'totalDays',
			header: 'Total Days',
			value: (row) => row.totalDays,
			compare: (a, b) => a.totalDays - b.totalDays,
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

	function toggleSet<T>(set: SvelteSet<T>, value: T): void {
		if (set.has(value)) set.delete(value);
		else set.add(value);
	}

	function handleExportExcel() {
		if (!report.result) return;
		return exportStatusDaysWorkbook(report.result, statusTypes, startDate, endDate);
	}
</script>

<ReportWorkspace.Root ariaLabel="Status days summary report">
	<ReportWorkspace.Filters title="Report configuration">
		{#snippet dateRange()}
			<ReportWorkspace.DateRangeField
				bind:start={startDate}
				bind:end={endDate}
				presets={ReportWorkspace.YEAR_PRESETS}
			/>
		{/snippet}

		{#snippet actions()}
			<Button onclick={report.run} disabled={!report.canRun}>
				{report.status === 'loading' ? 'Generating...' : 'Generate Report'}
			</Button>
		{/snippet}

		<div class="min-w-0 space-y-2">
			<NativeSelect bind:value={filterMode} aria-label="Filter personnel">
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

			{#if filterMode === 'name'}
				<Input type="text" placeholder="Search by name..." bind:value={nameSearch} />
				<div class="flex max-h-48 flex-col gap-0.5 overflow-y-auto rounded-md border border-border p-1">
					{#each nameFilteredPersonnel as person (person.id)}
						<label class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted">
							<input
								type="checkbox"
								checked={selectedPersonnelIds.has(person.id)}
								onchange={() => toggleSet(selectedPersonnelIds, person.id)}
							/>
							<span>{person.rank} {person.lastName}, {person.firstName}</span>
						</label>
					{/each}
				</div>
			{:else if filterMode === 'group'}
				<div class="flex max-h-48 flex-col gap-0.5 overflow-y-auto rounded-md border border-border p-1">
					{#each groups as group (group.id)}
						<label class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted">
							<input
								type="checkbox"
								checked={selectedGroupIds.has(group.id)}
								onchange={() => toggleSet(selectedGroupIds, group.id)}
							/>
							<span>{group.name}</span>
						</label>
					{/each}
				</div>
			{:else if filterMode === 'mos'}
				<div class="flex max-h-48 flex-col gap-0.5 overflow-y-auto rounded-md border border-border p-1">
					{#each uniqueMosCodes as mos (mos)}
						<label class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted">
							<input
								type="checkbox"
								checked={selectedMosCodes.has(mos)}
								onchange={() => toggleSet(selectedMosCodes, mos)}
							/>
							<span>{mos}</span>
						</label>
					{/each}
				</div>
			{:else if filterMode === 'role'}
				<div class="flex max-h-48 flex-col gap-0.5 overflow-y-auto rounded-md border border-border p-1">
					{#each uniqueRoles as role (role)}
						<label class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted">
							<input
								type="checkbox"
								checked={selectedRoles.has(role)}
								onchange={() => toggleSet(selectedRoles, role)}
							/>
							<span>{role}</span>
						</label>
					{/each}
				</div>
			{/if}

			<p class="text-xs text-muted-foreground">{filteredPersonnel.length} of {personnel.length} personnel selected</p>
		</div>

		<div class="min-w-0 space-y-2">
			<div class="flex flex-wrap items-center gap-2">
				<Button type="button" variant="outline" size="sm" onclick={statusSelect.toggleAll}>
					{statusSelect.allSelected ? 'Deselect All' : 'Select All'}
				</Button>
				<span class="text-xs text-muted-foreground">
					{statusSelect.count} of {statusTypes.length} selected
				</span>
			</div>
			<div class="flex max-h-48 flex-wrap gap-2 overflow-y-auto rounded-md border border-border p-2">
				{#each statusTypes as statusType (statusType.id)}
					<button
						type="button"
						class="rounded-md border border-border px-2 py-1 text-sm text-foreground"
						style:background={statusSelect.has(statusType.id) ? statusType.color : 'transparent'}
						style:color={statusSelect.has(statusType.id) ? statusType.textColor : undefined}
						onclick={() => statusSelect.toggle(statusType.id)}
					>
						{statusType.name}
					</button>
				{/each}
			</div>
		</div>
	</ReportWorkspace.Filters>

	{#if report.status === 'loading'}
		<ReportWorkspace.State state="loading" title="Generating report" />
	{:else if report.status === 'error'}
		<ReportWorkspace.State state="error" title="Report failed" description={report.error ?? undefined} />
	{:else if report.result}
		<ReportWorkspace.Table
			title="Status days"
			meta={resultMeta}
			{table}
			columns={tableColumns}
			ariaLabel="Status days summary"
			emptyMessage="No data found for the selected criteria."
		>
			{#snippet actions()}
				<ReportWorkspace.ExportAction label="Export Excel" onclick={handleExportExcel} />
			{/snippet}

			{#snippet cell(row, column)}
				{#if column.key === 'rank'}
					{row.person.rank}
				{:else if column.key === 'name'}
					{row.person.lastName}, {row.person.firstName}
				{:else}
					{String(column.value(row) ?? '')}
				{/if}
			{/snippet}
		</ReportWorkspace.Table>
	{/if}
</ReportWorkspace.Root>
