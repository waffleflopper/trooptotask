<script lang="ts">
	import { tick } from 'svelte';
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
	import { TRAINING_STATUS_COLORS } from '$features/training/training.types';
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

	let { data } = $props();

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

	const statusOptions: { value: TrainingStatus; label: string }[] = [
		{ value: 'current', label: 'Current' },
		{ value: 'warning-yellow', label: 'Expiring 60d' },
		{ value: 'warning-orange', label: 'Expiring 30d' },
		{ value: 'expired', label: 'Expired' },
		{ value: 'not-completed', label: 'Not Done' }
	];

	const hasActiveFilters = $derived(
		!!filterGroupId || !!filterMos || !!filterRole || !!filterRank || !!filterStatus || filterTypeIds.length > 0
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

	function sortIndicator(col: string): string {
		if (sortColumn !== col) return '';
		return sortAsc ? ' \u25b2' : ' \u25bc';
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

	function getSelectValue(event: Event): string {
		return (event.currentTarget as HTMLSelectElement).value;
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

	function toggleTypeFilter(typeId: string) {
		if (filterTypeIds.includes(typeId)) {
			filterTypeIds = filterTypeIds.filter((id) => id !== typeId);
		} else {
			filterTypeIds = [...filterTypeIds, typeId];
		}
		void reloadFirstReportPage();
	}

	function getReadinessColor(pct: number): string {
		if (pct >= 80) return 'var(--success)';
		if (pct >= 60) return 'var(--amber)';
		return 'var(--danger)';
	}
</script>

<PageToolbar
	title="Training Reports"
	breadcrumbs={[{ label: 'Training', href: `/org/${org.orgId}/training` }, { label: 'Reports' }]}
>
	<button class="btn btn-sm" type="button" onclick={exportCSV} disabled={pivotRows.length === 0}>Export CSV</button>
	<a href={`/org/${org.orgId}/training`} class="btn btn-sm">Back</a>
</PageToolbar>

{#if allTypes.length === 0}
	<EmptyState message="No training types configured. Create training types first." />
{:else}
	<div class="reports-page-shell">
		<div class="report-filters">
			<div class="filter-row">
				<select
					class="input filter-select"
					bind:value={filterGroupId}
					aria-label="Filter by group"
					onchange={(event) => {
						filterGroupId = getSelectValue(event);
						void reloadFirstReportPage();
					}}
				>
					<option value="">All Groups</option>
					{#each allGroups as group (group.id)}
						<option value={group.id}>{group.name}</option>
					{/each}
				</select>

				<select
					class="input filter-select"
					bind:value={filterRank}
					aria-label="Filter by rank"
					onchange={(event) => {
						filterRank = getSelectValue(event);
						void reloadFirstReportPage();
					}}
				>
					<option value="">All Ranks</option>
					{#each availableRanks as rank (rank)}
						<option value={rank}>{rank}</option>
					{/each}
				</select>

				<select
					class="input filter-select"
					bind:value={filterMos}
					aria-label="Filter by MOS"
					onchange={(event) => {
						filterMos = getSelectValue(event);
						void reloadFirstReportPage();
					}}
				>
					<option value="">All MOS</option>
					{#each availableMos as mos (mos)}
						<option value={mos}>{mos}</option>
					{/each}
				</select>

				<select
					class="input filter-select"
					bind:value={filterRole}
					aria-label="Filter by role"
					onchange={(event) => {
						filterRole = getSelectValue(event);
						void reloadFirstReportPage();
					}}
				>
					<option value="">All Roles</option>
					{#each availableRoles as role (role)}
						<option value={role}>{role}</option>
					{/each}
				</select>

				<select
					class="input filter-select"
					bind:value={filterStatus}
					aria-label="Filter by status"
					onchange={(event) => {
						filterStatus = getSelectValue(event) as TrainingStatus | '';
						void reloadFirstReportPage();
					}}
				>
					<option value="">All Statuses</option>
					{#each statusOptions as opt (opt.value)}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>

				<div class="filter-actions">
					<Badge label={`${detailPersonnelCount} personnel`} variant="outlined" />
					{#if hasActiveFilters}
						<button class="btn btn-sm" type="button" onclick={clearFilters}>Clear filters</button>
					{/if}
				</div>
			</div>

			{#if availableTypeFilters.length > 1}
				<div class="type-filter-chips">
					<span class="filter-label">Training types</span>
					{#each availableTypeFilters as type (type.id)}
						<button
							class="type-filter-chip"
							class:active={filterTypeIds.includes(type.id)}
							type="button"
							onclick={() => toggleTypeFilter(type.id)}
						>
							<span class="chip-dot" style="background-color: {type.color}"></span>
							{type.name}
						</button>
					{/each}
					{#if filterTypeIds.length > 0}
						<button
							class="type-filter-chip type-filter-chip-clear"
							type="button"
							onclick={() => {
								filterTypeIds = [];
								void reloadFirstReportPage();
							}}
						>
							Clear
						</button>
					{/if}
				</div>
			{/if}
		</div>

		<div class="dashboard">
			<div class="dashboard-row">
				<div class="dashboard-card">
					<div class="card-label">Overall Readiness</div>
					<div class="readiness-value" style="color: {getReadinessColor(dashboard.readinessPercent)}">
						{dashboard.readinessPercent}%
					</div>
				</div>

				<div class="dashboard-card">
					<div class="card-label">Status Breakdown</div>
					<div class="status-cards">
						<div class="status-card">
							<div class="status-header">
								<span class="status-dot" style="background-color: {TRAINING_STATUS_COLORS.current}"></span>
								<span class="status-name">Current</span>
							</div>
							<span class="status-count">{dashboard.statusCounts.current}</span>
						</div>
						<div class="status-card">
							<div class="status-header">
								<span class="status-dot" style="background-color: {TRAINING_STATUS_COLORS['warning-yellow']}"></span>
								<span class="status-name">60d</span>
							</div>
							<span class="status-count">{dashboard.statusCounts.warningYellow}</span>
						</div>
						<div class="status-card">
							<div class="status-header">
								<span class="status-dot" style="background-color: {TRAINING_STATUS_COLORS['warning-orange']}"></span>
								<span class="status-name">30d</span>
							</div>
							<span class="status-count">{dashboard.statusCounts.warningOrange}</span>
						</div>
						<div class="status-card">
							<div class="status-header">
								<span class="status-dot" style="background-color: {TRAINING_STATUS_COLORS.expired}"></span>
								<span class="status-name">Expired</span>
							</div>
							<span class="status-count">{dashboard.statusCounts.expired}</span>
						</div>
						<div class="status-card">
							<div class="status-header">
								<span class="status-dot" style="background-color: {TRAINING_STATUS_COLORS['not-completed']}"></span>
								<span class="status-name">Not Done</span>
							</div>
							<span class="status-count">{dashboard.statusCounts.notCompleted}</span>
						</div>
					</div>
				</div>
			</div>

			<div class="dashboard-row">
				{#if dashboard.worstTypes.length > 0}
					<div class="dashboard-card">
						<div class="card-label">Worst Training Types</div>
						<div class="worst-list">
							{#each dashboard.worstTypes as wt (wt.typeId)}
								<div class="worst-item">
									<span class="worst-name">{wt.typeName}</span>
									<div class="worst-bar-container">
										<div
											class="worst-bar"
											style="width: {wt.nonComplianceRate}%; background-color: {getReadinessColor(
												100 - wt.nonComplianceRate
											)}"
										></div>
									</div>
									<span class="worst-rate">{wt.nonComplianceRate}%</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				{#if dashboard.groupComparison.length > 1}
					<div class="dashboard-card">
						<div class="card-label">Group Comparison</div>
						<div class="group-list">
							{#each dashboard.groupComparison as gc (gc.groupId)}
								<div class="group-item">
									<span class="group-name">{gc.groupName}</span>
									<div class="group-bar-container">
										<div
											class="group-bar"
											style="width: {gc.readinessPercent}%; background-color: {getReadinessColor(gc.readinessPercent)}"
										></div>
									</div>
									<span class="group-rate">{gc.readinessPercent}%</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>

		<div class="detail-section">
			<div class="detail-header">
				<h3 class="section-title">Detail Table</h3>
				<div class="detail-header-actions">
					{#if reportLoading}
						<span class="detail-status">Loading page...</span>
					{/if}
					<Badge label={`${detailPersonnelCount} personnel`} variant="outlined" />
				</div>
			</div>
			{#if reportError}
				<div class="report-error" role="alert">{reportError}</div>
			{/if}

			{#if sortedRows.length === 0}
				<EmptyState message="No personnel match the current filters." />
			{:else}
				<div class="table-container">
					<table class="report-table">
						<thead>
							<tr>
								<th class="col-name">
									<button class="sort-button" type="button" onclick={() => toggleSort('name')}>
										Name{sortIndicator('name')}
									</button>
								</th>
								<th class="col-rank">
									<button class="sort-button" type="button" onclick={() => toggleSort('rank')}>
										Rank{sortIndicator('rank')}
									</button>
								</th>
								<th class="col-group">
									<button class="sort-button" type="button" onclick={() => toggleSort('group')}>
										Group{sortIndicator('group')}
									</button>
								</th>
								{#each filteredTypes as type (type.id)}
									<th class="col-type">
										<button class="sort-button sort-button-type" type="button" onclick={() => toggleSort(type.id)}>
											<span class="type-dot" style="background-color: {type.color}"></span>
											{type.name}{sortIndicator(type.id)}
										</button>
									</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each sortedRows as row (row.person.id)}
								<tr>
									<td class="col-name">{row.person.lastName}, {row.person.firstName}</td>
									<td class="col-rank">{row.person.rank}</td>
									<td class="col-group">{row.person.groupName}</td>
									{#each filteredTypes as type (type.id)}
										{@const cell = row.cells.get(type.id)}
										<td
											class="col-type cell-status"
											style="background-color: {cell ? TRAINING_STATUS_COLORS[cell.status] + '18' : undefined}"
										>
											<span class="cell-content">
												<span
													class="cell-dot"
													style="background-color: {cell ? TRAINING_STATUS_COLORS[cell.status] : undefined}"
												></span>
												<span class="cell-text">
													{cell ? formatTrainingCellText(cell.label, cell.date) : ''}
												</span>
											</span>
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if activeReport}
					<div class="pagination-bar">
						<span class="pagination-summary">Page {currentPage} of {totalPages}</span>
						<div class="pagination-actions">
							<button
								class="btn btn-sm"
								type="button"
								onclick={() => loadReportPage(currentPage - 1)}
								disabled={!canPageBack}
							>
								Previous page
							</button>
							<button
								class="btn btn-sm"
								type="button"
								onclick={() => loadReportPage(currentPage + 1)}
								disabled={!canPageForward}
							>
								Next page
							</button>
						</div>
					</div>
				{/if}
			{/if}
		</div>
	</div>
{/if}

<style>
	.reports-page-shell {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		padding: var(--sp-3);
	}

	.report-filters {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		padding: var(--sp-3);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: color-mix(in srgb, var(--surface-panel) 90%, var(--surface-subtle) 10%);
	}

	.filter-row {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--sp-2);
	}

	.filter-select {
		min-width: 9.5rem;
		max-width: 12rem;
	}

	.filter-actions {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin-left: auto;
	}

	.type-filter-chips {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2);
	}

	.type-filter-chip {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-3);
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.type-filter-chip:hover {
		border-color: var(--border-strong);
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
	}

	.type-filter-chip.active {
		border-color: color-mix(in srgb, var(--amber) 38%, var(--border-default));
		background: color-mix(in srgb, var(--amber-light) 82%, var(--surface-panel) 18%);
		color: var(--amber-dark);
	}

	.chip-dot {
		width: 0.625rem;
		height: 0.625rem;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.dashboard {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		margin-bottom: var(--sp-4);
	}

	.dashboard-row {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--sp-4);
	}

	.dashboard-card {
		min-width: 0;
		padding: var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.card-label {
		margin-bottom: var(--sp-3);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.readiness-value {
		font-family: var(--font-display);
		font-size: clamp(2.6rem, 2.2rem + 1vw, 3.2rem);
		font-weight: var(--font-weight-display);
		line-height: 1;
	}

	.status-cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
		gap: var(--sp-2);
	}

	.status-card {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--sp-2);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-subtle) 52%, var(--surface-panel) 48%);
	}

	.status-header {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.status-dot {
		width: 0.625rem;
		height: 0.625rem;
		border-radius: 2px;
	}

	.status-count {
		font-family: var(--font-display);
		font-size: clamp(1.6rem, 1.35rem + 0.3vw, 1.9rem);
		font-weight: var(--font-weight-display);
		color: var(--text-primary);
		line-height: 1;
	}

	.status-name {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.worst-list,
	.group-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.worst-item,
	.group-item {
		display: grid;
		grid-template-columns: minmax(0, 180px) minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--sp-2);
	}

	.worst-name,
	.group-name {
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.worst-bar-container,
	.group-bar-container {
		height: 0.75rem;
		overflow: hidden;
		border: 1px solid color-mix(in srgb, var(--border-default) 65%, transparent);
		border-radius: 999px;
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
	}

	.worst-bar,
	.group-bar {
		height: 100%;
		border-radius: inherit;
	}

	.worst-rate,
	.group-rate {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.detail-section {
		overflow: hidden;
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.detail-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		padding: var(--sp-4) var(--sp-6);
		border-bottom: var(--border-thin);
		background: color-mix(in srgb, var(--surface-subtle) 48%, var(--surface-panel) 52%);
	}

	.detail-header-actions {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.detail-status,
	.pagination-summary {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.report-error {
		padding: var(--sp-3) var(--sp-6);
		border-bottom: var(--border-thin);
		background: color-mix(in srgb, var(--danger) 12%, var(--surface-panel));
		color: var(--danger);
	}

	.section-title {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-primary);
	}

	.table-container {
		overflow-x: auto;
	}

	.pagination-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		padding: var(--sp-3) var(--sp-6);
		border-top: var(--border-thin);
		background: color-mix(in srgb, var(--surface-subtle) 36%, var(--surface-panel) 64%);
	}

	.pagination-actions {
		display: inline-flex;
		gap: var(--sp-2);
	}

	.report-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	.report-table th {
		position: sticky;
		top: 0;
		padding: 0;
		background: color-mix(in srgb, var(--surface-subtle) 42%, var(--surface-panel) 58%);
		border-bottom: var(--border-thin);
		text-align: left;
	}

	.report-table td {
		padding: var(--sp-3) var(--sp-4);
		border-bottom: var(--border-thin);
		white-space: nowrap;
		vertical-align: top;
	}

	.report-table tbody tr:hover {
		background: color-mix(in srgb, var(--surface-subtle) 46%, var(--surface-panel) 54%);
	}

	.sort-button {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		width: 100%;
		padding: var(--sp-3) var(--sp-4);
		border: 0;
		background: transparent;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-secondary);
		cursor: pointer;
	}

	.sort-button:hover {
		color: var(--text-primary);
		background: color-mix(in srgb, var(--surface-subtle) 56%, transparent);
	}

	.sort-button-type {
		justify-content: center;
	}

	.col-name {
		min-width: 180px;
	}

	.col-rank,
	.col-group {
		min-width: 90px;
	}

	.col-type {
		min-width: 164px;
		text-align: left;
	}

	.type-dot,
	.cell-dot {
		display: inline-block;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 2px;
		vertical-align: middle;
	}

	.cell-dot {
		margin-right: var(--sp-2);
	}

	.cell-status {
		white-space: nowrap;
	}

	.cell-content {
		display: inline-flex;
		align-items: center;
	}

	.cell-text {
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		color: var(--text-primary);
	}

	@media (max-width: 960px) {
		.reports-page-shell {
			padding: var(--sp-2);
		}

		.dashboard-row {
			grid-template-columns: 1fr;
		}

		.worst-item,
		.group-item {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 640px) {
		.reports-page-shell {
			padding: var(--sp-2);
		}

		.filter-select {
			width: 100%;
			max-width: none;
		}

		.filter-actions {
			width: 100%;
			margin-left: 0;
			justify-content: space-between;
		}

		.status-cards {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
