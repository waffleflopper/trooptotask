<script lang="ts">
	import { tick } from 'svelte';
	import * as Empty from '$lib/components/ui/empty';
	import { Button } from '$lib/components/ui/button';
	import type { ColumnDef } from '$lib/components/ui/data-table';
	import * as ReportWorkspace from '$lib/components/ui/report-workspace';
	import { TrainingStatusCell } from '$lib/components/ui/requirement-status-badge';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import type { WorkspaceToolbarAction } from '$lib/components/ui/workspace-toolbar';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { rosterStore } from '$lib/stores/roster.svelte';
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
		type ReportFilters,
		type TypeBreakdown
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
	let expandedTypeId = $state<string | null>(null);

	const allPersonnel = $derived<Personnel[]>(
		rosterStore.orgId === org.orgId
			? rosterStore.items
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
		const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
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

	function setGroupFilter(groupId: string) {
		filterGroupId = filterGroupId === groupId ? '' : groupId;
		void reloadFirstReportPage();
	}

	function setStatusFilter(status: TrainingStatus | '') {
		filterStatus = filterStatus === status ? '' : status;
		void reloadFirstReportPage();
	}

	function readinessToneClass(pct: number): string {
		if (pct >= 80) return 'text-success-foreground';
		if (pct >= 60) return 'text-warning-foreground';
		return 'text-danger-foreground';
	}

	function readinessBarClass(pct: number): string {
		if (pct >= 80) return 'bg-success';
		if (pct >= 60) return 'bg-warning';
		return 'bg-destructive';
	}

	const statusDotClass: Record<string, string> = {
		current: 'bg-success',
		'warning-yellow': 'bg-warning',
		'warning-orange': 'bg-warning',
		expired: 'bg-destructive',
		'not-completed': 'bg-muted-foreground/40'
	};

	const statusBarClass: Record<string, string> = {
		current: 'bg-success',
		warning: 'bg-warning',
		expired: 'bg-destructive',
		notCompleted: 'bg-muted-foreground/30'
	};

	function ringDasharray(pct: number, r = 36): string {
		const c = 2 * Math.PI * r;
		return `${(pct / 100) * c} ${c - (pct / 100) * c}`;
	}

	function ringStrokeClass(pct: number): string {
		if (pct >= 80) return 'stroke-success';
		if (pct >= 60) return 'stroke-warning';
		return 'stroke-destructive';
	}

	const typeBreakdown = $derived<TypeBreakdown[]>(dashboard.typeBreakdown ?? []);

	function expandedPersonnelForType(typeId: string, status: 'expired' | 'expiring') {
		const rows = sortedRows.length > 0 ? sortedRows : pivotRows;
		return rows.filter((row) => {
			const cell = row.cells.get(typeId);
			if (!cell) return false;
			if (status === 'expired') return cell.status === 'expired' || cell.status === 'not-completed';
			return cell.status === 'warning-yellow' || cell.status === 'warning-orange';
		});
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
		<!-- Hero: readiness ring + status pills -->
		<header
			class="flex min-w-0 flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between"
		>
			<div class="flex items-center gap-4">
				<svg class="size-16 -rotate-90 shrink-0" viewBox="0 0 80 80" aria-hidden="true">
					<circle cx="40" cy="40" r="36" fill="none" stroke-width="5" class="stroke-muted" />
					<circle
						cx="40"
						cy="40"
						r="36"
						fill="none"
						stroke-width="5"
						stroke-linecap="round"
						class={ringStrokeClass(dashboard.readinessPercent)}
						stroke-dasharray={ringDasharray(dashboard.readinessPercent)}
					/>
				</svg>
				<div>
					<h2 class="text-xl font-semibold tracking-normal text-foreground">Training Readiness</h2>
					<p class="text-sm text-muted-foreground">
						<span class="font-semibold {readinessToneClass(dashboard.readinessPercent)}"
							>{dashboard.readinessPercent}%</span
						>
						across {detailPersonnelCount} personnel
					</p>
				</div>
			</div>
			<div class="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by training status">
				{#each [{ status: 'current' as TrainingStatus, count: dashboard.statusCounts.current, label: 'Current' }, { status: 'expired' as TrainingStatus, count: dashboard.statusCounts.expired, label: 'Expired' }, { status: 'warning-orange' as TrainingStatus, count: dashboard.statusCounts.warningOrange + dashboard.statusCounts.warningYellow, label: 'Expiring' }, { status: 'not-completed' as TrainingStatus, count: dashboard.statusCounts.notCompleted, label: 'Not Done' }] as pill (pill.status)}
					<button
						type="button"
						class="flex items-center gap-1.5 rounded-md border px-2.5 py-1 transition-colors hover:bg-muted/50 {filterStatus ===
						pill.status
							? 'border-foreground bg-muted'
							: 'border-border'}"
						aria-pressed={filterStatus === pill.status}
						onclick={() => setStatusFilter(pill.status)}
					>
						<span class="size-2 rounded-full {statusDotClass[pill.status]}"></span>
						<span class="font-mono text-[0.6875rem] font-semibold text-foreground">{pill.count}</span>
						<span class="font-mono text-[0.6875rem] text-muted-foreground">{pill.label}</span>
					</button>
				{/each}
			</div>
		</header>

		<!-- Toolbar: group filter pills + personnel/report filters + actions -->
		<ReportWorkspace.Toolbar ariaLabel="Training report controls">
			<WorkspaceToolbar.Group label="Group filter" activeCount={filterGroupId ? 1 : 0}>
				{#each allGroups as group (group.id)}
					<Button
						variant={filterGroupId === group.id ? 'secondary' : 'outline'}
						size="sm"
						class={filterGroupId === group.id ? 'bg-accent text-accent-foreground' : ''}
						aria-pressed={filterGroupId === group.id}
						onclick={() => setGroupFilter(group.id)}
					>
						{group.name}
					</Button>
				{/each}
			</WorkspaceToolbar.Group>
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
			<!-- Training type cards grid -->
			{#if typeBreakdown.length > 0}
				<section aria-label="Training type breakdown">
					<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{#each typeBreakdown as tb (tb.typeId)}
							{@const warningTotal = tb.warningYellow + tb.warningOrange}
							{@const isExpanded = expandedTypeId === tb.typeId}
							{@const expiredRows = isExpanded ? expandedPersonnelForType(tb.typeId, 'expired') : []}
							{@const expiringRows = isExpanded ? expandedPersonnelForType(tb.typeId, 'expiring') : []}
							<button
								type="button"
								class="flex flex-col items-start rounded-lg border border-border bg-card p-3 text-left transition-shadow hover:shadow-sm {isExpanded
									? 'ring-2 ring-ring/20'
									: ''}"
								aria-expanded={isExpanded}
								onclick={() => (expandedTypeId = isExpanded ? null : tb.typeId)}
							>
								<div class="flex w-full items-start justify-between gap-3">
									<div class="min-w-0 flex-1">
										<h3 class="truncate text-sm font-semibold text-foreground">{tb.typeName}</h3>
										<p class="mt-0.5 font-mono text-[0.6875rem] text-muted-foreground">
											{tb.applicable} personnel
										</p>
									</div>
									<svg class="size-11 -rotate-90 shrink-0" viewBox="0 0 80 80" aria-hidden="true">
										<circle cx="40" cy="40" r="36" fill="none" stroke-width="6" class="stroke-muted" />
										<circle
											cx="40"
											cy="40"
											r="36"
											fill="none"
											stroke-width="6"
											stroke-linecap="round"
											class={ringStrokeClass(tb.complianceRate)}
											stroke-dasharray={ringDasharray(tb.complianceRate)}
										/>
										<text
											x="40"
											y="44"
											text-anchor="middle"
											class="fill-foreground font-mono text-[1.5rem] font-bold"
											transform="rotate(90 40 40)">{tb.complianceRate}</text
										>
									</svg>
								</div>

								<!-- Stacked status bar -->
								{#if tb.applicable > 0}
									<div class="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-muted">
										{#if tb.current > 0}
											<div class={statusBarClass.current} style:width="{(tb.current / tb.applicable) * 100}%"></div>
										{/if}
										{#if warningTotal > 0}
											<div class={statusBarClass.warning} style:width="{(warningTotal / tb.applicable) * 100}%"></div>
										{/if}
										{#if tb.expired > 0}
											<div class={statusBarClass.expired} style:width="{(tb.expired / tb.applicable) * 100}%"></div>
										{/if}
										{#if tb.notCompleted > 0}
											<div
												class={statusBarClass.notCompleted}
												style:width="{(tb.notCompleted / tb.applicable) * 100}%"
											></div>
										{/if}
									</div>
								{/if}

								<!-- Counts -->
								<div class="mt-2 flex w-full flex-wrap gap-x-3 gap-y-1">
									{#if tb.expired > 0}
										<span class="font-mono text-[0.6875rem] text-danger-foreground">{tb.expired} expired</span>
									{/if}
									{#if warningTotal > 0}
										<span class="font-mono text-[0.6875rem] text-warning-foreground">{warningTotal} expiring</span>
									{/if}
									{#if tb.notCompleted > 0}
										<span class="font-mono text-[0.6875rem] text-muted-foreground">{tb.notCompleted} not done</span>
									{/if}
								</div>

								<!-- Expanded: personnel with issues -->
								{#if isExpanded && (expiredRows.length > 0 || expiringRows.length > 0)}
									<div class="mt-3 w-full border-t border-border pt-3">
										{#if expiredRows.length > 0}
											<p
												class="mb-1 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-danger-foreground"
											>
												Expired / Not Done
											</p>
											<ul class="space-y-0.5">
												{#each expiredRows.slice(0, 6) as row (row.person.id)}
													<li class="flex items-center justify-between text-xs">
														<span class="text-foreground">{row.person.lastName}, {row.person.firstName}</span>
														<span class="font-mono text-[0.6875rem] text-muted-foreground"
															>{row.person.rank} · {row.person.groupName}</span
														>
													</li>
												{/each}
												{#if expiredRows.length > 6}
													<li class="font-mono text-[0.6875rem] text-muted-foreground">
														+{expiredRows.length - 6} more
													</li>
												{/if}
											</ul>
										{/if}
										{#if expiringRows.length > 0}
											<p
												class="mb-1 mt-2 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-warning-foreground"
											>
												Expiring Soon
											</p>
											<ul class="space-y-0.5">
												{#each expiringRows.slice(0, 4) as row (row.person.id)}
													<li class="flex items-center justify-between text-xs">
														<span class="text-foreground">{row.person.lastName}, {row.person.firstName}</span>
														<span class="font-mono text-[0.6875rem] text-muted-foreground"
															>{row.person.rank} · {row.person.groupName}</span
														>
													</li>
												{/each}
												{#if expiringRows.length > 4}
													<li class="font-mono text-[0.6875rem] text-muted-foreground">
														+{expiringRows.length - 4} more
													</li>
												{/if}
											</ul>
										{/if}
									</div>
								{/if}
							</button>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Two-column: type compliance + group readiness -->
			<div class="grid gap-4 lg:grid-cols-2">
				<ReportWorkspace.Section title="Training Type Compliance" description="Sorted by lowest compliance">
					<div class="grid gap-2">
						{#each [...typeBreakdown].sort((a, b) => a.complianceRate - b.complianceRate) as tb (tb.typeId)}
							<div class="grid gap-1 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] sm:items-center">
								<span class="truncate text-sm font-semibold text-foreground">{tb.typeName}</span>
								<div class="h-3 overflow-hidden rounded-full border border-border bg-muted">
									<div
										class="h-full rounded-full {readinessBarClass(tb.complianceRate)}"
										style:width="{tb.complianceRate}%"
									></div>
								</div>
								<div class="flex items-center gap-2">
									<span class="w-10 text-right font-mono text-xs font-semibold {readinessToneClass(tb.complianceRate)}">
										{tb.complianceRate}%
									</span>
									{#if tb.expired > 0}
										<span class="w-14 text-right font-mono text-[0.6875rem] text-danger-foreground"
											>{tb.expired} exp</span
										>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</ReportWorkspace.Section>

				{#if dashboard.groupComparison.length > 1}
					<ReportWorkspace.Section title="Group Readiness" description="Click to filter by group">
						<div class="grid gap-2">
							{#each dashboard.groupComparison as gc (gc.groupId)}
								<button
									type="button"
									class="grid gap-1 rounded-md px-1 py-1 transition-colors hover:bg-muted/40 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] sm:items-center {filterGroupId ===
									gc.groupId
										? 'bg-muted/60'
										: ''}"
									aria-pressed={filterGroupId === gc.groupId}
									onclick={() => setGroupFilter(gc.groupId)}
								>
									<span class="truncate text-sm font-semibold text-foreground">{gc.groupName}</span>
									<div class="h-3 overflow-hidden rounded-full border border-border bg-muted">
										<div
											class="h-full rounded-full {readinessBarClass(gc.readinessPercent)}"
											style:width="{gc.readinessPercent}%"
										></div>
									</div>
									<span class="font-mono text-xs font-semibold {readinessToneClass(gc.readinessPercent)}">
										{gc.readinessPercent}%
									</span>
								</button>
							{/each}
						</div>
					</ReportWorkspace.Section>
				{/if}
			</div>

			{#if reportError}
				<ReportWorkspace.State state="error" title="Report page failed" description={reportError} />
			{/if}

			<ReportWorkspace.Table
				title="Personnel Detail"
				description="{detailPersonnelCount} of {allPersonnel.length} personnel"
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
