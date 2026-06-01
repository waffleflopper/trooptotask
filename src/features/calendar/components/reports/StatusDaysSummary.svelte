<script lang="ts">
	import type { Personnel, StatusType } from '$lib/types';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
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

	const filterModeOptions = $derived<{ value: FilterMode; label: string }[]>([
		{ value: 'all', label: 'All Personnel' },
		{ value: 'name', label: 'By Name' },
		{ value: 'group', label: 'By Group' },
		...(uniqueMosCodes.length > 0 ? [{ value: 'mos' as const, label: 'By MOS' }] : []),
		...(uniqueRoles.length > 0 ? [{ value: 'role' as const, label: 'By Duty Role' }] : [])
	]);
	const filterModeLabel = $derived(
		filterModeOptions.find((option) => option.value === filterMode)?.label ?? 'All Personnel'
	);

	const groupOptions = $derived(groups.map((group) => ({ id: group.id, label: group.name })));
	const mosOptions = $derived(uniqueMosCodes.map((mos) => ({ id: mos, label: mos })));
	const roleOptions = $derived(uniqueRoles.map((role) => ({ id: role, label: role })));
	const statusChipOptions = $derived(
		statusTypes.map((statusType) => ({ id: statusType.id, label: statusType.name, color: statusType.color }))
	);

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

	const namePersonnelOptions = $derived(
		nameFilteredPersonnel.map((person) => ({
			id: person.id,
			label: `${person.rank} ${person.lastName}, ${person.firstName}`
		}))
	);

	const report = ReportWorkspace.createReportRun({
		validate: () => {
			if (!startDate || !endDate) return 'Select a date range.';
			if (filteredPersonnel.length === 0) return 'Select at least one person.';
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
			header: 'Total status days',
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

<ReportWorkspace.Root ariaLabel="Status days by person report">
	<ReportWorkspace.Filters
		title="Build status-day report"
		description="Counts selected calendar statuses for each person across the date range."
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
				{report.status === 'loading' ? 'Counting status days...' : 'Run status-day report'}
			</Button>
		{/snippet}

		<div class="min-w-0 space-y-2">
			<span class="font-mono text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground"> Personnel </span>
			<Select.Root type="single" value={filterMode} onValueChange={(value) => (filterMode = value as FilterMode)}>
				<Select.Trigger size="sm" aria-label="Filter personnel" class="w-full">
					{filterModeLabel}
				</Select.Trigger>
				<Select.Content>
					{#each filterModeOptions as option (option.value)}
						<Select.Item value={option.value} label={option.label} />
					{/each}
				</Select.Content>
			</Select.Root>

			{#if filterMode === 'name'}
				<Input type="text" placeholder="Search by name..." bind:value={nameSearch} />
				<ReportWorkspace.OptionList
					ariaLabel="Select personnel"
					options={namePersonnelOptions}
					selectedIds={selectedPersonnelIds}
					onToggle={(id) => toggleSet(selectedPersonnelIds, id)}
					emptyMessage="No personnel match your search."
				/>
			{:else if filterMode === 'group'}
				<ReportWorkspace.OptionList
					ariaLabel="Select groups"
					options={groupOptions}
					selectedIds={selectedGroupIds}
					onToggle={(id) => toggleSet(selectedGroupIds, id)}
				/>
			{:else if filterMode === 'mos'}
				<ReportWorkspace.OptionList
					ariaLabel="Select MOS codes"
					options={mosOptions}
					selectedIds={selectedMosCodes}
					onToggle={(id) => toggleSet(selectedMosCodes, id)}
				/>
			{:else if filterMode === 'role'}
				<ReportWorkspace.OptionList
					ariaLabel="Select duty roles"
					options={roleOptions}
					selectedIds={selectedRoles}
					onToggle={(id) => toggleSet(selectedRoles, id)}
				/>
			{/if}

			<p class="text-xs text-muted-foreground">{filteredPersonnel.length} of {personnel.length} personnel selected</p>
		</div>

		<ReportWorkspace.OptionChips
			label="Status types"
			ariaLabel="Select status types"
			options={statusChipOptions}
			selectedIds={statusSelect.selectedIds}
			onToggle={statusSelect.toggle}
			onToggleAll={statusSelect.toggleAll}
			allSelected={statusSelect.allSelected}
		/>
	</ReportWorkspace.Filters>

	{#if report.status === 'loading'}
		<ReportWorkspace.State state="loading" title="Counting status days" />
	{:else if report.status === 'error'}
		<ReportWorkspace.State
			state="error"
			title="Could not build status-day report"
			description={report.error ?? undefined}
		/>
	{:else if report.result}
		<ReportWorkspace.Table
			title="Status days by person"
			description="Each status column shows how many days were recorded for that person."
			meta={resultMeta}
			{table}
			columns={tableColumns}
			ariaLabel="Status days by person"
			emptyMessage="No selected status entries fall in this date range. Try more statuses, more personnel, or a wider range."
		>
			{#snippet actions()}
				<ReportWorkspace.ExportAction label="Export status days" onclick={handleExportExcel} />
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
