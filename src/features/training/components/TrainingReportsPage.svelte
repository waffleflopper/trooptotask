<script lang="ts">
	import { tick } from 'svelte';
	import * as Empty from '$lib/components/ui/empty';
	import { Button } from '$lib/components/ui/button';
	import * as ReportWorkspace from '$lib/components/ui/report-workspace';
	import { TrainingStatusCell } from '$lib/components/ui/requirement-status-badge';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import type { WorkspaceToolbarAction } from '$lib/components/ui/workspace-toolbar';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { rosterStore } from '$lib/stores/roster.svelte';
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
	import type { TrainingStatus } from '$features/training/training.types';
	import type { Personnel } from '$lib/types';
	import { groupsStore, type Group } from '$lib/stores/groups.svelte';
	import type { TrainingReportData } from '$lib/server/core/useCases/trainingReportsQuery';
	import {
		buildTrainingReportExportUrl,
		buildTrainingReportScreenModel,
		buildTrainingReportUrl,
		formatTrainingReportCell,
		getTrainingReportRowsForType,
		type TrainingReportColumn,
		type TrainingReportFilterState,
		type TrainingReportPivotRow,
		type TrainingReportSortState
	} from '$features/training/read-model/trainingReportScreenModel';
	import { generatePivotCSV } from '$features/training/utils/reportCalculations';

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
	let sortColumn = $state<string>('name');
	let sortAsc = $state(true);

	const sourcePersonnel = $derived<Personnel[]>(
		rosterStore.orgId === org.orgId
			? rosterStore.items
			: Array.isArray(workspaceData?.personnel)
				? workspaceData.personnel
				: Array.isArray(data.personnel)
					? data.personnel
					: []
	);
	const sourceGroups = $derived<Group[]>(
		groupsStore.orgId === org.orgId
			? groupsStore.items
			: Array.isArray(workspaceData?.groups)
				? workspaceData.groups
				: Array.isArray(data.groups)
					? data.groups
					: []
	);
	const sourceTrainingTypes = $derived(trainingTypesStore.items);
	const localTrainingTypes = $derived(trainingTypesStore.items);
	const allTrainings = $derived(personnelTrainingsStore.items);
	const reportFilters = $derived<TrainingReportFilterState>({
		groupId: filterGroupId,
		mos: filterMos,
		role: filterRole,
		rank: filterRank,
		status: filterStatus,
		trainingTypeIds: filterTypeIds
	});
	const reportSort = $derived<TrainingReportSortState>({
		column: sortColumn,
		ascending: sortAsc
	});
	const screen = $derived(
		buildTrainingReportScreenModel({
			activeReport,
			serverReport,
			personnel: sourcePersonnel,
			groups: sourceGroups,
			trainingTypes: sourceTrainingTypes,
			localTrainingTypes,
			trainings: allTrainings,
			filters: reportFilters,
			sort: reportSort
		})
	);
	const canPageBack = $derived(!!activeReport && screen.currentPage > 1 && !reportLoading);
	const canPageForward = $derived(!!activeReport && screen.currentPage < screen.totalPages && !reportLoading);

	function toggleSort(col: string) {
		if (sortColumn === col) {
			sortAsc = !sortAsc;
		} else {
			sortColumn = col;
			sortAsc = true;
		}
		void reloadFirstReportPage();
	}

	function buildReportUrl(page: number): string {
		return buildTrainingReportUrl({
			orgId: org.orgId,
			filters: reportFilters,
			sort: reportSort,
			page,
			pageSize: screen.pageSize
		});
	}

	function buildReportExportUrl(): string {
		return buildTrainingReportExportUrl({
			orgId: org.orgId,
			filters: reportFilters,
			sort: reportSort
		});
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

		const rows = screen.pivotRows;
		const csv = generatePivotCSV(rows, screen.filteredLocalTrainingTypes);
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

	function expandedPersonnelForType(typeId: string, status: 'expired' | 'expiring') {
		const rows = screen.sortedRows.length > 0 ? screen.sortedRows : screen.pivotRows;
		return getTrainingReportRowsForType(rows, typeId, status);
	}

	const toolbarActions = $derived<WorkspaceToolbarAction[]>([
		{
			id: 'clear-filters',
			label: 'Clear filters',
			onclick: clearFilters,
			disabled: !screen.hasActiveFilters,
			disabledReason: !screen.hasActiveFilters ? 'No filters are active' : undefined,
			priority: 'normal'
		},
		{
			id: 'export-csv',
			label: 'Export',
			onclick: exportCSV,
			disabled: screen.pivotRows.length === 0,
			disabledReason: screen.pivotRows.length === 0 ? 'No report rows to export' : undefined,
			icon: 'download',
			priority: 'critical',
			variant: 'primary'
		}
	]);
</script>

{#snippet reportHeaderCell(column: TrainingReportColumn)}
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

{#snippet reportCell(row: TrainingReportPivotRow, column: TrainingReportColumn)}
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
				label={formatTrainingReportCell(cell)}
				srLabel={cell.label}
				class="min-w-24"
			/>
		{/if}
	{/if}
{/snippet}

{#if screen.allTypes.length === 0}
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
						class={ringStrokeClass(screen.dashboard.readinessPercent)}
						stroke-dasharray={ringDasharray(screen.dashboard.readinessPercent)}
					/>
				</svg>
				<div>
					<h2 class="text-xl font-semibold tracking-normal text-foreground">Training Readiness</h2>
					<p class="text-sm text-muted-foreground">
						<span class="font-semibold {readinessToneClass(screen.dashboard.readinessPercent)}"
							>{screen.dashboard.readinessPercent}%</span
						>
						across {screen.detailPersonnelCount} personnel
					</p>
				</div>
			</div>
			<div class="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by training status">
				{#each [{ status: 'current' as TrainingStatus, count: screen.dashboard.statusCounts.current, label: 'Current' }, { status: 'expired' as TrainingStatus, count: screen.dashboard.statusCounts.expired, label: 'Expired' }, { status: 'warning-orange' as TrainingStatus, count: screen.dashboard.statusCounts.warningOrange + screen.dashboard.statusCounts.warningYellow, label: 'Expiring' }, { status: 'not-completed' as TrainingStatus, count: screen.dashboard.statusCounts.notCompleted, label: 'Not Done' }] as pill (pill.status)}
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
				{#each screen.allGroups as group (group.id)}
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
				activeCount={screen.personnelFilterCount}
				data-testid="training-personnel-filters"
			>
				<WorkspaceToolbar.Select
					ariaLabel="Filter by rank"
					options={screen.rankFilterOptions}
					value={filterRank}
					onValueChange={(value) => {
						filterRank = value;
						void reloadFirstReportPage();
					}}
				/>
				<WorkspaceToolbar.Select
					ariaLabel="Filter by MOS"
					options={screen.mosFilterOptions}
					value={filterMos}
					onValueChange={(value) => {
						filterMos = value;
						void reloadFirstReportPage();
					}}
				/>
				<WorkspaceToolbar.Select
					ariaLabel="Filter by duty role"
					options={screen.roleFilterOptions}
					value={filterRole}
					onValueChange={(value) => {
						filterRole = value;
						void reloadFirstReportPage();
					}}
				/>
			</WorkspaceToolbar.Group>
			<WorkspaceToolbar.Group
				label="Report filters"
				activeCount={screen.reportFilterCount}
				data-testid="training-report-filters"
			>
				<WorkspaceToolbar.Select
					ariaLabel="Filter by status"
					options={screen.statusFilterOptions}
					value={filterStatus}
					onValueChange={(value) => {
						filterStatus = value as TrainingStatus | '';
						void reloadFirstReportPage();
					}}
				/>
				{#if screen.typeFilterOptions.length > 1}
					<WorkspaceToolbar.MultiSelect
						options={screen.typeFilterOptions}
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
			{#if screen.typeBreakdown.length > 0}
				<section aria-label="Training type breakdown">
					<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{#each screen.typeBreakdown as tb (tb.typeId)}
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
						{#each [...screen.typeBreakdown].sort((a, b) => a.complianceRate - b.complianceRate) as tb (tb.typeId)}
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

				{#if screen.dashboard.groupComparison.length > 1}
					<ReportWorkspace.Section title="Group Readiness" description="Click to filter by group">
						<div class="grid gap-2">
							{#each screen.dashboard.groupComparison as gc (gc.groupId)}
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
				description="{screen.detailPersonnelCount} of {screen.allPersonnel.length} personnel"
				data={screen.sortedRows}
				columns={screen.reportColumns}
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
						Page {screen.currentPage} of {screen.totalPages}
					</span>
					<div class="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							type="button"
							onclick={() => loadReportPage(screen.currentPage - 1)}
							disabled={!canPageBack}
						>
							Previous page
						</Button>
						<Button
							variant="outline"
							size="sm"
							type="button"
							onclick={() => loadReportPage(screen.currentPage + 1)}
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
