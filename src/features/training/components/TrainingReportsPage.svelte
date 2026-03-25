<script lang="ts">
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
	import { TRAINING_STATUS_COLORS } from '$features/training/training.types';
	import type { TrainingStatus } from '$features/training/training.types';
	import type { Personnel } from '$lib/types';
	import {
		filterPersonnel,
		computeReadinessDashboard,
		buildPivotTable,
		generatePivotCSV,
		type ReportFilters
	} from '$features/training/utils/reportCalculations';

	let { data } = $props();

	const org = getOrgContext();

	// --- Filters ---
	let filterGroupId = $state('');
	let filterMos = $state('');
	let filterRole = $state('');
	let filterRank = $state('');
	let filterStatus = $state<TrainingStatus | ''>('');
	let filterTypeIds = $state<string[]>([]);

	// --- Data ---
	const allPersonnel = $derived<Personnel[]>(data.personnel ?? []);
	const allGroups = $derived(data.groups ?? []);
	const allTypes = $derived(trainingTypesStore.items);
	const allTrainings = $derived(personnelTrainingsStore.items);

	// --- Derived filter options ---
	const availableMos = $derived([...new Set(allPersonnel.map((p) => p.mos))].filter(Boolean).sort());
	const availableRoles = $derived([...new Set(allPersonnel.map((p) => p.clinicRole))].filter(Boolean).sort());
	const availableRanks = $derived([...new Set(allPersonnel.map((p) => p.rank))].filter(Boolean).sort());

	// --- Apply filters ---
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

	// --- Dashboard & Pivot (both use same filtered data) ---
	const dashboard = $derived(computeReadinessDashboard(filteredPersonnel, filteredTypes, allTrainings));
	const pivotRows = $derived(() => {
		const rows = buildPivotTable(filteredPersonnel, filteredTypes, allTrainings);
		if (!filterStatus) return rows;
		return rows.filter((row) => {
			for (const cell of row.cells.values()) {
				if (cell.status === filterStatus) return true;
			}
			return false;
		});
	});

	// --- Sort ---
	let sortColumn = $state<string>('name');
	let sortAsc = $state(true);

	const sortedRows = $derived(() => {
		const rows = [...pivotRows()];
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
				const aLabel = aCell?.label ?? '';
				const bLabel = bCell?.label ?? '';
				cmp = aLabel.localeCompare(bLabel);
			}
			return sortAsc ? cmp : -cmp;
		});
		return rows;
	});

	function toggleSort(col: string) {
		if (sortColumn === col) {
			sortAsc = !sortAsc;
		} else {
			sortColumn = col;
			sortAsc = true;
		}
	}

	function sortIndicator(col: string): string {
		if (sortColumn !== col) return '';
		return sortAsc ? ' \u25B2' : ' \u25BC';
	}

	// --- Status filter helpers ---
	const statusOptions: { value: TrainingStatus; label: string }[] = [
		{ value: 'current', label: 'Current' },
		{ value: 'warning-yellow', label: 'Expiring 60d' },
		{ value: 'warning-orange', label: 'Expiring 30d' },
		{ value: 'expired', label: 'Expired' },
		{ value: 'not-completed', label: 'Not Done' }
	];

	// --- Export ---
	function exportCSV() {
		const rows = pivotRows();
		const csv = generatePivotCSV(rows, filteredTypes);
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
	}

	const hasActiveFilters = $derived(
		!!filterGroupId || !!filterMos || !!filterRole || !!filterRank || !!filterStatus || filterTypeIds.length > 0
	);

	function toggleTypeFilter(typeId: string) {
		if (filterTypeIds.includes(typeId)) {
			filterTypeIds = filterTypeIds.filter((id) => id !== typeId);
		} else {
			filterTypeIds = [...filterTypeIds, typeId];
		}
	}

	function getReadinessColor(pct: number): string {
		if (pct >= 80) return 'var(--color-success, #22c55e)';
		if (pct >= 60) return 'var(--color-warning, #eab308)';
		return 'var(--color-danger, #ef4444)';
	}
</script>

<PageToolbar
	title="Training Reports"
	breadcrumbs={[{ label: 'Training', href: `/org/${org.orgId}/training` }, { label: 'Reports' }]}
>
	<button class="btn btn-sm" onclick={exportCSV} disabled={pivotRows().length === 0}> Export CSV </button>
	<a href={`/org/${org.orgId}/training`} class="btn btn-sm">Back</a>
</PageToolbar>

{#if allTypes.length === 0}
	<EmptyState message="No training types configured. Create training types first." />
{:else}
	<!-- Filters -->
	<div class="report-filters">
		<div class="filter-row">
			<select class="input filter-select" bind:value={filterGroupId}>
				<option value="">All Groups</option>
				{#each allGroups as group (group.id)}
					<option value={group.id}>{group.name}</option>
				{/each}
			</select>

			<select class="input filter-select" bind:value={filterRank}>
				<option value="">All Ranks</option>
				{#each availableRanks as rank (rank)}
					<option value={rank}>{rank}</option>
				{/each}
			</select>

			<select class="input filter-select" bind:value={filterMos}>
				<option value="">All MOS</option>
				{#each availableMos as mos (mos)}
					<option value={mos}>{mos}</option>
				{/each}
			</select>

			<select class="input filter-select" bind:value={filterRole}>
				<option value="">All Roles</option>
				{#each availableRoles as role (role)}
					<option value={role}>{role}</option>
				{/each}
			</select>

			<select class="input filter-select" bind:value={filterStatus}>
				<option value="">All Statuses</option>
				{#each statusOptions as opt (opt.value)}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>

			{#if hasActiveFilters}
				<button class="btn btn-sm" onclick={clearFilters}>Clear</button>
			{/if}
		</div>

		{#if allTypes.length > 1}
			<div class="type-filter-chips">
				<span class="filter-label">Training types:</span>
				{#each allTypes as type (type.id)}
					<button class="chip" class:active={filterTypeIds.includes(type.id)} onclick={() => toggleTypeFilter(type.id)}>
						<span class="chip-dot" style="background-color: {type.color}"></span>
						{type.name}
					</button>
				{/each}
				{#if filterTypeIds.length > 0}
					<button class="chip chip-clear" onclick={() => (filterTypeIds = [])}>Clear</button>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Readiness Dashboard -->
	<div class="dashboard">
		<div class="dashboard-row">
			<!-- Overall Readiness -->
			<div class="card card-readiness">
				<div class="card-label">Overall Readiness</div>
				<div class="readiness-value" style="color: {getReadinessColor(dashboard.readinessPercent)}">
					{dashboard.readinessPercent}%
				</div>
			</div>

			<!-- Status Breakdown -->
			<div class="card card-status">
				<div class="card-label">Status Breakdown</div>
				<div class="status-cards">
					<div class="status-card">
						<span class="status-dot" style="background-color: {TRAINING_STATUS_COLORS.current}"></span>
						<span class="status-count">{dashboard.statusCounts.current}</span>
						<span class="status-name">Current</span>
					</div>
					<div class="status-card">
						<span class="status-dot" style="background-color: {TRAINING_STATUS_COLORS['warning-yellow']}"></span>
						<span class="status-count">{dashboard.statusCounts.warningYellow}</span>
						<span class="status-name">Expiring 60d</span>
					</div>
					<div class="status-card">
						<span class="status-dot" style="background-color: {TRAINING_STATUS_COLORS['warning-orange']}"></span>
						<span class="status-count">{dashboard.statusCounts.warningOrange}</span>
						<span class="status-name">Expiring 30d</span>
					</div>
					<div class="status-card">
						<span class="status-dot" style="background-color: {TRAINING_STATUS_COLORS.expired}"></span>
						<span class="status-count">{dashboard.statusCounts.expired}</span>
						<span class="status-name">Expired</span>
					</div>
					<div class="status-card">
						<span class="status-dot" style="background-color: {TRAINING_STATUS_COLORS['not-completed']}"></span>
						<span class="status-count">{dashboard.statusCounts.notCompleted}</span>
						<span class="status-name">Not Done</span>
					</div>
				</div>
			</div>
		</div>

		<div class="dashboard-row">
			<!-- Worst Training Types -->
			{#if dashboard.worstTypes.length > 0}
				<div class="card card-worst">
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

			<!-- Group Comparison -->
			{#if dashboard.groupComparison.length > 1}
				<div class="card card-groups">
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

	<!-- Detail Table -->
	<div class="detail-section">
		<div class="detail-header">
			<h3 class="section-title">Detail Table</h3>
			<span class="result-count">{sortedRows().length} personnel</span>
		</div>

		{#if sortedRows().length === 0}
			<EmptyState message="No personnel match the current filters." />
		{:else}
			<div class="table-container">
				<table class="report-table">
					<thead>
						<tr>
							<th class="col-name sortable" onclick={() => toggleSort('name')}>
								Name{sortIndicator('name')}
							</th>
							<th class="col-rank sortable" onclick={() => toggleSort('rank')}>
								Rank{sortIndicator('rank')}
							</th>
							<th class="col-group sortable" onclick={() => toggleSort('group')}>
								Group{sortIndicator('group')}
							</th>
							{#each filteredTypes as type (type.id)}
								<th class="col-type sortable" onclick={() => toggleSort(type.id)}>
									<span class="type-dot" style="background-color: {type.color}"></span>
									{type.name}{sortIndicator(type.id)}
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each sortedRows() as row (row.person.id)}
							<tr>
								<td class="col-name">{row.person.lastName}, {row.person.firstName}</td>
								<td class="col-rank">{row.person.rank}</td>
								<td class="col-group">{row.person.groupName}</td>
								{#each filteredTypes as type (type.id)}
									{@const cell = row.cells.get(type.id)}
									<td
										class="col-type cell-status"
										style="background-color: {cell ? TRAINING_STATUS_COLORS[cell.status] + '18' : ''}"
									>
										<span class="cell-dot" style="background-color: {cell ? TRAINING_STATUS_COLORS[cell.status] : ''}"
										></span>
										<span class="cell-label">{cell?.label ?? ''}</span>
										{#if cell?.date}
											<span class="cell-date">{cell.date}</span>
										{/if}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
{/if}

<style>
	/* Filters */
	.report-filters {
		padding: var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.filter-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-sm);
		align-items: center;
	}

	.filter-select {
		min-width: 140px;
		max-width: 180px;
		font-size: var(--font-size-sm);
		padding: 6px 8px;
	}

	.type-filter-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
		align-items: center;
	}

	.filter-label {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		font-weight: 500;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 10px;
		border: 1px solid var(--color-border);
		border-radius: 999px;
		background: var(--color-bg);
		font-size: var(--font-size-xs);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.chip:hover {
		border-color: var(--color-primary);
	}

	.chip.active {
		background: var(--color-primary);
		color: white;
		border-color: var(--color-primary);
	}

	.chip-clear {
		color: var(--color-text-muted);
		font-style: italic;
	}

	.chip-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	/* Dashboard */
	.dashboard {
		padding: var(--spacing-md);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.dashboard-row {
		display: flex;
		gap: var(--spacing-md);
	}

	.card {
		flex: 1;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--spacing-md);
	}

	.card-label {
		font-size: var(--font-size-xs);
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: var(--spacing-sm);
	}

	.readiness-value {
		font-family: var(--font-display);
		font-size: 2.5rem;
		font-weight: 700;
		line-height: 1;
	}

	.status-cards {
		display: flex;
		gap: var(--spacing-md);
		flex-wrap: wrap;
	}

	.status-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		min-width: 60px;
	}

	.status-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}

	.status-count {
		font-size: var(--font-size-lg);
		font-weight: 600;
	}

	.status-name {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		text-align: center;
	}

	/* Worst types */
	.worst-list,
	.group-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.worst-item,
	.group-item {
		display: grid;
		grid-template-columns: 120px 1fr 50px;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.worst-name,
	.group-name {
		font-size: var(--font-size-sm);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.worst-bar-container,
	.group-bar-container {
		height: 8px;
		background: var(--color-surface-variant);
		border-radius: 4px;
		overflow: hidden;
	}

	.worst-bar,
	.group-bar {
		height: 100%;
		border-radius: 4px;
		transition: width 0.3s ease;
	}

	.worst-rate,
	.group-rate {
		font-size: var(--font-size-sm);
		font-weight: 500;
		text-align: right;
	}

	/* Detail Table */
	.detail-section {
		padding: var(--spacing-md);
	}

	.detail-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--spacing-md);
	}

	.section-title {
		font-family: var(--font-display);
		font-size: var(--font-size-base);
		font-weight: 500;
		margin: 0;
	}

	.result-count {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.table-container {
		overflow-x: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.report-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--font-size-sm);
	}

	.report-table th {
		position: sticky;
		top: 0;
		background: var(--color-surface-variant);
		font-weight: 500;
		text-align: left;
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 2px solid var(--color-border);
		white-space: nowrap;
	}

	.report-table th.sortable {
		cursor: pointer;
		user-select: none;
	}

	.report-table th.sortable:hover {
		background: var(--color-border);
	}

	.report-table td {
		padding: var(--spacing-xs) var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
		white-space: nowrap;
	}

	.report-table tbody tr:hover {
		background: var(--color-surface-variant);
	}

	.col-name {
		min-width: 150px;
	}

	.col-rank,
	.col-group {
		min-width: 80px;
	}

	.col-type {
		min-width: 120px;
	}

	.type-dot,
	.cell-dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		margin-right: 4px;
		vertical-align: middle;
	}

	.cell-status {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.cell-label {
		font-size: var(--font-size-xs);
	}

	.cell-date {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	/* Responsive */
	@media (max-width: 768px) {
		.dashboard-row {
			flex-direction: column;
		}

		.filter-row {
			flex-direction: column;
		}

		.filter-select {
			max-width: none;
			width: 100%;
		}

		.worst-item,
		.group-item {
			grid-template-columns: 100px 1fr 40px;
		}

		.status-cards {
			gap: var(--spacing-sm);
		}
	}
</style>
