<script lang="ts">
	import { tick } from 'svelte';
	import * as Empty from '$lib/components/ui/empty';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import type { ColumnDef } from '$lib/components/ui/data-table';
	import * as ReportWorkspace from '$lib/components/ui/report-workspace';
	import { TrainingStatusBadge, TrainingStatusCell } from '$lib/components/ui/requirement-status-badge';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import type { WorkspaceToolbarAction } from '$lib/components/ui/workspace-toolbar';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
	import type { TrainingStatus } from '$features/training/training.types';
	import { formatTrainingCellText } from '$features/training/utils/cellDisplayText';
	import type { Personnel } from '$lib/types';
	import { groupsStore, type Group } from '$lib/stores/groups.svelte';
	import type { TrainingReportData } from '$lib/server/core/useCases/trainingReportsQuery';
	import {
		filterPersonnel,
		computeReadinessDashboard,
		buildPivotTable,
		generatePivotCSV,
		type ReportFilters
	} from '$features/training/utils/reportCalculations';

	interface Props {
		data: {
			training?: {
				data?: {
					personnel?: Personnel[];
					groups?: Group[];
					[key: string]: unknown;
				};
			};
			trainingReport?: TrainingReportData;
			personnel?: Personnel[];
			groups?: Group[];
		};
	}

	type PivotRow = ReturnType<typeof buildPivotTable>[number];

	let { data }: Props = $props();

	const org = getOrgContext();
	const workspaceData = $derived(data.training?.data);
	const serverReport = $derived((data.trainingReport as TrainingReportData | undefined) ?? null);
	let report = $state<TrainingReportData | null>(null);
	const activeReport = $derived(report ?? serverReport);
	let reportLoading = $state(false);
	let reportError = $state<string | null>(null);
	let reportRequestId = 0;
	let lastServerReport: TrainingReportData | null = null;

	$effect(() => {
		const nextServerReport = serverReport;
		if (nextServerReport !== lastServerReport) {
			lastServerReport = nextServerReport;
			report = null;
			reportError = null;
			reportLoading = false;
			reportRequestId += 1;
		}
	});

	let filterGroupId = $state('');
	let filterMos = $state('');
	let filterRole = $state('');
	let filterRank = $state('');
	let filterStatus = $state<TrainingStatus | ''>('');
	let filterTypeIds = $state<string[]>([]);

	const allPersonnel = $derived<Personnel[]>(
		personnelStore.orgId === org.orgId
			? personnelStore.items
			: Array.isArray(workspaceData?.personnel)
				? workspaceData.personnel
				: Array.isArray(data.personnel)
					? data.personnel
					: []
	);
	const allGroups = $derived<Group[]>(
		activeReport?.filterOptions.groups ??
			(groupsStore.orgId === org.orgId
				? groupsStore.items
				: Array.isArray(workspaceData?.groups)
					? workspaceData.groups
					: Array.isArray(data.groups)
						? data.groups
						: [])
	);
	const allTypes = $derived(activeReport?.trainingTypes ?? trainingTypesStore.items);
	const localTrainingTypes = $derived(trainingTypesStore.items);
	const availableTypeFilters = $derived(serverReport?.trainingTypes ?? allTypes);
	const allTrainings = $derived(personnelTrainingsStore.items);

	const availableMos = $derived(
		activeReport?.filterOptions.mos ?? [...new Set(allPersonnel.map((p) => p.mos))].filter(Boolean).sort()
	);
	const availableRoles = $derived(
		activeReport?.filterOptions.roles ?? [...new Set(allPersonnel.map((p) => p.clinicRole))].filter(Boolean).sort()
	);
	const availableRanks = $derived(
		activeReport?.filterOptions.ranks ?? [...new Set(allPersonnel.map((p) => p.rank))].filter(Boolean).sort()
	);

	const filters = $derived<ReportFilters>({
		groupId: filterGroupId || undefined,
		mos: filterMos || undefined,
		role: filterRole || undefined,
		rank: filterRank || undefined
	});

	const filteredPersonnel = $derived(filterPersonnel(allPersonnel, filters));
	const filteredTypes = $derived(
		filterTypeIds.length > 0 ? allTypes.filter((t) => filterTypeIds.includes(t.id)) : allTypes
	);
	const filteredLocalTrainingTypes = $derived(
		filterTypeIds.length > 0 ? localTrainingTypes.filter((type) => filterTypeIds.includes(type.id)) : localTrainingTypes
	);
	const typeFilterOptions = $derived(availableTypeFilters.map((type) => ({ value: type.id, label: type.name })));

	const dashboard = $derived(
		activeReport?.dashboard ?? computeReadinessDashboard(filteredPersonnel, filteredLocalTrainingTypes, allTrainings)
	);
	const serverPivotRows = $derived(
		(activeReport?.detail.rows ?? []).map((row) => ({
			person: row.person,
			cells: new Map(row.cells.map((cell) => [cell.trainingTypeId, cell]))
		}))
	);
	const pivotRows = $derived.by(() => {
		if (activeReport) return serverPivotRows;

		const rows = buildPivotTable(filteredPersonnel, filteredLocalTrainingTypes, allTrainings);
		if (!filterStatus) return rows;
		return rows.filter((row) => {
			for (const cell of row.cells.values()) {
				if (cell.status === filterStatus) return true;
			}
			return false;
		});
	});

	let sortColumn = $state<string>('name');
	let sortAsc = $state(true);

	const statusOrder: Record<TrainingStatus, number> = {
		expired: 0,
		'warning-orange': 1,
		'warning-yellow': 2,
		'not-completed': 3,
		current: 4,
		'not-required': 5,
		exempt: 6
	};

	const sortedRows = $derived.by(() => {
		if (activeReport) return pivotRows;

		const rows = [...pivotRows];
		rows.sort((a, b) => {
			let cmp = 0;
			if (sortColumn === 'name') {
				cmp =
					a.person.lastName.localeCompare(b.person.lastName) || a.person.firstName.localeCompare(b.person.firstName);
			} else if (sortColumn === 'rank') {
				cmp = a.person.rank.localeCompare(b.person.rank);
			} else if (sortColumn === 'group') {
				cmp = a.person.groupName.localeCompare(b.person.groupName);
			} else {
				const aCell = a.cells.get(sortColumn);
				const bCell = b.cells.get(sortColumn);
				const aOrder = aCell ? (statusOrder[aCell.status] ?? 99) : 99;
				const bOrder = bCell ? (statusOrder[bCell.status] ?? 99) : 99;
				cmp = aOrder - bOrder;
			}
			return sortAsc ? cmp : -cmp;
		});
		return rows;
	});

	const reportColumns = $derived<ColumnDef<PivotRow>[]>([
		{
			key: 'name',
			header: 'Name',
			value: (row) => `${row.person.lastName}, ${row.person.firstName}`,
			compare: (a, b) => a.person.lastName.localeCompare(b.person.lastName)
		},
		{ key: 'rank', header: 'Rank', value: (row) => row.person.rank },
		{ key: 'group', header: 'Group', value: (row) => row.person.groupName },
		...filteredTypes.map((type) => ({
			key: type.id,
			header: type.name,
			value: (row: PivotRow) => {
				const cell = row.cells.get(type.id);
				return cell ? formatTrainingCellText(cell.status, cell.label, cell.date) : '';
			},
			sortable: false
		}))
	]);

	const statusOptions: { value: TrainingStatus; label: string }[] = [
		{ value: 'current', label: 'Current' },
		{ value: 'warning-yellow', label: 'Expiring 60d' },
		{ value: 'warning-orange', label: 'Expiring 30d' },
		{ value: 'expired', label: 'Expired' },
		{ value: 'not-completed', label: 'Not Done' }
	];
	const groupFilterOptions = $derived([
		{ value: '', label: 'All Groups' },
		...allGroups.map((group) => ({ value: group.id, label: group.name }))
	]);
	const rankFilterOptions = $derived([
		{ value: '', label: 'All Ranks' },
		...availableRanks.map((rank) => ({ value: rank, label: rank }))
	]);
	const mosFilterOptions = $derived([
		{ value: '', label: 'All MOS' },
		...availableMos.map((mos) => ({ value: mos, label: mos }))
	]);
	const roleFilterOptions = $derived([
		{ value: '', label: 'All Duty Roles' },
		...availableRoles.map((role) => ({ value: role, label: role }))
	]);
	const statusFilterOptions = [{ value: '', label: 'All Statuses' }, ...statusOptions];

	const hasActiveFilters = $derived(
		!!filterGroupId || !!filterMos || !!filterRole || !!filterRank || !!filterStatus || filterTypeIds.length > 0
	);
	const personnelFilterCount = $derived((filterMos ? 1 : 0) + (filterRole ? 1 : 0) + (filterRank ? 1 : 0));
	const reportFilterCount = $derived(
		(filterGroupId ? 1 : 0) + (filterStatus ? 1 : 0) + (filterTypeIds.length > 0 ? 1 : 0)
	);
	const detailPersonnelCount = $derived(activeReport?.detail.totalRows ?? filteredPersonnel.length);
	const currentPage = $derived(activeReport?.detail.page ?? 1);
	const totalPages = $derived(activeReport?.detail.totalPages ?? 1);
	const pageSize = $derived(activeReport?.detail.pageSize ?? 25);
	const canPageBack = $derived(!!activeReport && currentPage > 1 && !reportLoading);
	const canPageForward = $derived(!!activeReport && currentPage < totalPages && !reportLoading);

	function toggleSort(col: string) {
		if (sortColumn === col) {
			sortAsc = !sortAsc;
		} else {
			sortColumn = col;
			sortAsc = true;
		}
		void reloadFirstReportPage();
	}

	function appendReportParam(params: string[], key: string, value: string): void {
		params.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
	}

	function buildReportQueryString(): string {
		const params: string[] = [];
		if (filterGroupId) appendReportParam(params, 'groupId', filterGroupId);
		if (filterMos) appendReportParam(params, 'mos', filterMos);
		if (filterRole) appendReportParam(params, 'role', filterRole);
		if (filterRank) appendReportParam(params, 'rank', filterRank);
		if (filterStatus) appendReportParam(params, 'status', filterStatus);
		for (const typeId of filterTypeIds) {
			appendReportParam(params, 'trainingTypeId', typeId);
		}
		appendReportParam(params, 'sortColumn', sortColumn);
		appendReportParam(params, 'sortDirection', sortAsc ? 'asc' : 'desc');
		return params.join('&');
	}

	function buildReportUrl(page: number): string {
		const query = buildReportQueryString();
		return `/org/${org.orgId}/api/training-reports?${query}&page=${page}&pageSize=${pageSize}`;
	}

	function buildReportExportUrl(): string {
		return `/org/${org.orgId}/api/training-reports/export?${buildReportQueryString()}`;
	}

	async function loadReportPage(page: number): Promise<void> {
		if (!activeReport) return;
		const requestId = ++reportRequestId;
		reportLoading = true;
		reportError = null;
		try {
			const response = await fetch(buildReportUrl(page));
			if (!response.ok) {
				throw new Error('Failed to load training report page');
			}
			const nextReport = (await response.json()) as TrainingReportData;
			if (requestId === reportRequestId) {
				report = nextReport;
			}
		} catch (error) {
			if (requestId === reportRequestId) {
				reportError = error instanceof Error ? error.message : 'Failed to load training report page';
			}
		} finally {
			if (requestId === reportRequestId) {
				reportLoading = false;
			}
		}
	}

	async function reloadFirstReportPage(): Promise<void> {
		if (!activeReport) return;
		await tick();
		await loadReportPage(1);
	}

	function exportCSV() {
		if (activeReport) {
			const link = document.createElement('a');
			link.setAttribute('href', buildReportExportUrl());
			link.setAttribute('download', 'training-report.csv');
			link.style.visibility = 'hidden';
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			return;
		}

		const rows = pivotRows;
		const csv = generatePivotCSV(rows, filteredLocalTrainingTypes);
		const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.setAttribute('href', url);
		link.setAttribute('download', 'training-report.csv');
		link.style.visibility = 'hidden';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	}

	function clearFilters() {
		filterGroupId = '';
		filterMos = '';
		filterRole = '';
		filterRank = '';
		filterStatus = '';
		filterTypeIds = [];
		void reloadFirstReportPage();
	}

	function setTypeFilters(typeIds: string[]) {
		filterTypeIds = typeIds;
		void reloadFirstReportPage();
	}

	function readinessVariant(pct: number): 'success' | 'warning' | 'destructive' {
		if (pct >= 80) return 'success';
		if (pct >= 60) return 'warning';
		return 'destructive';
	}

	const toolbarActions = $derived<WorkspaceToolbarAction[]>([
		{
			id: 'clear-filters',
			label: 'Clear filters',
			onclick: clearFilters,
			disabled: !hasActiveFilters,
			disabledReason: !hasActiveFilters ? 'No filters are active' : undefined,
			priority: 'normal'
		},
		{
			id: 'export-csv',
			label: 'Export',
			onclick: exportCSV,
			disabled: pivotRows.length === 0,
			disabledReason: pivotRows.length === 0 ? 'No report rows to export' : undefined,
			icon: 'download',
			priority: 'critical',
			variant: 'primary'
		}
	]);
</script>

{#snippet reportHeaderCell(column: ColumnDef<PivotRow>)}
	<button
		type="button"
		class="-ml-2 inline-flex h-8 items-center justify-start gap-1.5 bg-transparent px-2 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
		aria-label={`Sort by ${column.header}`}
		onclick={() => toggleSort(column.key)}
	>
		<span>{column.header}</span>
		{#if sortColumn === column.key}
			<span aria-hidden="true">{sortAsc ? '▲' : '▼'}</span>
		{/if}
	</button>
{/snippet}

{#snippet reportCell(row: PivotRow, column: ColumnDef<PivotRow>)}
	{#if column.key === 'name'}
		<span>{row.person.lastName}, {row.person.firstName}</span>
	{:else if column.key === 'rank'}
		<span>{row.person.rank}</span>
	{:else if column.key === 'group'}
		<span>{row.person.groupName}</span>
	{:else}
		{@const cell = row.cells.get(column.key)}
		{#if cell}
			<TrainingStatusCell
				status={cell.status}
				label={formatTrainingCellText(cell.status, cell.label, cell.date)}
				srLabel={cell.label}
				class="min-w-24"
			/>
		{/if}
	{/if}
{/snippet}

{#if allTypes.length === 0}
	<Empty.Root>
		<Empty.Header>
			<Empty.Title>No training types configured.</Empty.Title>
			<Empty.Description>Create training types first.</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{:else}
	<ReportWorkspace.Root ariaLabel="Training reports" class="p-3">
		<ReportWorkspace.Header
			title="Training reports"
			description="Review completion status, gaps, and readiness by person, group, and training type."
			meta={[
				{ label: 'Personnel', value: detailPersonnelCount },
				{ label: 'Readiness', value: `${dashboard.readinessPercent}%` }
			]}
		/>

		<ReportWorkspace.Toolbar ariaLabel="Training report controls">
			<WorkspaceToolbar.Group
				label="Personnel filters"
				activeCount={personnelFilterCount}
				data-testid="training-personnel-filters"
			>
				<WorkspaceToolbar.Select
					ariaLabel="Filter by rank"
					options={rankFilterOptions}
					value={filterRank}
					onValueChange={(value) => {
						filterRank = value;
						void reloadFirstReportPage();
					}}
				/>
				<WorkspaceToolbar.Select
					ariaLabel="Filter by MOS"
					options={mosFilterOptions}
					value={filterMos}
					onValueChange={(value) => {
						filterMos = value;
						void reloadFirstReportPage();
					}}
				/>
				<WorkspaceToolbar.Select
					ariaLabel="Filter by duty role"
					options={roleFilterOptions}
					value={filterRole}
					onValueChange={(value) => {
						filterRole = value;
						void reloadFirstReportPage();
					}}
				/>
			</WorkspaceToolbar.Group>
			<WorkspaceToolbar.Group
				label="Report filters"
				activeCount={reportFilterCount}
				data-testid="training-report-filters"
			>
				<WorkspaceToolbar.Select
					ariaLabel="Filter by group"
					options={groupFilterOptions}
					value={filterGroupId}
					onValueChange={(value) => {
						filterGroupId = value;
						void reloadFirstReportPage();
					}}
				/>
				<WorkspaceToolbar.Select
					ariaLabel="Filter by status"
					options={statusFilterOptions}
					value={filterStatus}
					onValueChange={(value) => {
						filterStatus = value as TrainingStatus | '';
						void reloadFirstReportPage();
					}}
				/>
				{#if typeFilterOptions.length > 1}
					<WorkspaceToolbar.MultiSelect
						options={typeFilterOptions}
						value={filterTypeIds}
						ariaLabel="Filter by training type"
						label="Training types"
						onChange={setTypeFilters}
					/>
				{/if}
			</WorkspaceToolbar.Group>

			<WorkspaceToolbar.Group label="Training report actions" zone="actions">
				<WorkspaceToolbar.Actions
					actions={toolbarActions}
					ariaLabel="Training report actions"
					overflowAriaLabel="More training report actions"
				/>
			</WorkspaceToolbar.Group>
		</ReportWorkspace.Toolbar>

		<ReportWorkspace.Content layout="stack">
			<div class="grid gap-4 lg:grid-cols-2">
				<ReportWorkspace.Section title={`Overall Readiness (${detailPersonnelCount} personnel)`}>
					<div class="flex items-center gap-3">
						<Badge variant={readinessVariant(dashboard.readinessPercent)}>{dashboard.readinessPercent}%</Badge>
						<span class="text-sm text-muted-foreground">Current report readiness</span>
					</div>
				</ReportWorkspace.Section>

				<ReportWorkspace.Section title="Status Breakdown">
					<div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
						{#each [['current', 'Current', dashboard.statusCounts.current], ['warning-yellow', '60d', dashboard.statusCounts.warningYellow], ['warning-orange', '30d', dashboard.statusCounts.warningOrange], ['expired', 'Expired', dashboard.statusCounts.expired], ['not-completed', 'Not Done', dashboard.statusCounts.notCompleted]] as item (item[0])}
							<div class="rounded-lg border border-border bg-muted/30 p-2">
								<TrainingStatusBadge status={item[0] as TrainingStatus} />
								<p class="mt-2 text-lg font-semibold text-foreground">{item[2]}</p>
								<p class="text-xs text-muted-foreground">{item[1]}</p>
							</div>
						{/each}
					</div>
				</ReportWorkspace.Section>

				{#if dashboard.worstTypes.length > 0}
					<ReportWorkspace.Section title="Worst Training Types">
						<div class="grid gap-2">
							{#each dashboard.worstTypes as wt (wt.typeId)}
								<div class="grid gap-1 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] sm:items-center">
									<span class="truncate text-sm font-semibold text-foreground">{wt.typeName}</span>
									<div class="h-3 overflow-hidden rounded-full border border-border bg-muted">
										<div class="h-full rounded-full bg-primary" style:width={`${wt.nonComplianceRate}%`}></div>
									</div>
									<span class="font-mono text-xs font-semibold uppercase text-muted-foreground">
										{wt.nonComplianceRate}%
									</span>
								</div>
							{/each}
						</div>
					</ReportWorkspace.Section>
				{/if}

				{#if dashboard.groupComparison.length > 1}
					<ReportWorkspace.Section title="Group Comparison">
						<div class="grid gap-2">
							{#each dashboard.groupComparison as gc (gc.groupId)}
								<div class="grid gap-1 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] sm:items-center">
									<span class="truncate text-sm font-semibold text-foreground">{gc.groupName}</span>
									<div class="h-3 overflow-hidden rounded-full border border-border bg-muted">
										<div class="h-full rounded-full bg-primary" style:width={`${gc.readinessPercent}%`}></div>
									</div>
									<span class="font-mono text-xs font-semibold uppercase text-muted-foreground">
										{gc.readinessPercent}%
									</span>
								</div>
							{/each}
						</div>
					</ReportWorkspace.Section>
				{/if}
			</div>

			{#if reportError}
				<ReportWorkspace.State state="error" title="Report page failed" description={reportError} />
			{/if}

			<ReportWorkspace.Table
				title="Detail Table"
				data={sortedRows}
				columns={reportColumns}
				ariaLabel="Training report detail rows"
				emptyMessage="No personnel match the current filters."
				loading={reportLoading}
				cell={reportCell}
				headerCell={reportHeaderCell}
				pageSize={activeReport ? undefined : 25}
			/>

			{#if activeReport}
				<div
					class="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
				>
					<span class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
						Page {currentPage} of {totalPages}
					</span>
					<div class="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							type="button"
							onclick={() => loadReportPage(currentPage - 1)}
							disabled={!canPageBack}
						>
							Previous page
						</Button>
						<Button
							variant="outline"
							size="sm"
							type="button"
							onclick={() => loadReportPage(currentPage + 1)}
							disabled={!canPageForward}
						>
							Next page
						</Button>
					</div>
				</div>
			{/if}
		</ReportWorkspace.Content>
	</ReportWorkspace.Root>
{/if}
