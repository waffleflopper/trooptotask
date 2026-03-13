<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { StatusType } from '../../calendar.types';
	import type { StatusDaysResult } from '../../utils/statusDaysReport';
	import { computeStatusDays } from '../../utils/statusDaysReport';
	import { exportStatusDaysCsv } from './StatusDaysSummaryExport';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

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
	let selectedPersonnelIds = $state<Set<string>>(new Set());
	let selectedGroupIds = $state<Set<string>>(new Set());
	let selectedMosCodes = $state<Set<string>>(new Set());
	let selectedRoles = $state<Set<string>>(new Set());
	let nameSearch = $state('');

	const uniqueMosCodes = $derived(
		[...new Set(personnel.map((p) => p.mos).filter(Boolean))].sort()
	);
	const uniqueRoles = $derived(
		[...new Set(personnel.map((p) => p.clinicRole).filter(Boolean))].sort()
	);

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
			? personnel.filter(
					(p) =>
						`${p.rank} ${p.lastName} ${p.firstName}`.toLowerCase().includes(nameSearch.toLowerCase())
				)
			: personnel
	);

	// --- Status type filter state ---
	let selectedStatusTypeIds = $state<Set<string>>(new Set(statusTypes.map((s) => s.id)));

	function toggleAllStatuses() {
		if (selectedStatusTypeIds.size === statusTypes.length) {
			selectedStatusTypeIds = new Set();
		} else {
			selectedStatusTypeIds = new Set(statusTypes.map((s) => s.id));
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
			const filteredEntries = selectedStatusTypeIds.size === statusTypes.length
				? data.entries
				: data.entries.filter((e: any) => selectedStatusTypeIds.has(e.statusTypeId));
			result = computeStatusDays(filteredPersonnel, filteredEntries, startDate, endDate);
		} catch (e: any) {
			errorMsg = e.message || 'Failed to generate report.';
		} finally {
			loading = false;
		}
	}

	function handleExportCsv() {
		if (!result) return;
		exportStatusDaysCsv(result, statusTypes, startDate, endDate);
	}

	function toggleSet<T>(set: Set<T>, value: T): Set<T> {
		const next = new Set(set);
		if (next.has(value)) next.delete(value);
		else next.add(value);
		return next;
	}

	const statusTypeMap = $derived(new Map(statusTypes.map((s) => [s.id, s])));

	const displayColumns = $derived(
		result
			? result.activeStatusTypeIds
					.map((id) => statusTypeMap.get(id))
					.filter((s): s is StatusType => !!s)
			: []
	);
</script>

<div class="report-config">
	<div class="config-section">
		<h3>Date Range</h3>
		<div class="date-row">
			<label class="form-group">
				<span class="label">Year</span>
				<select
					class="select"
					value={selectedYear ?? ''}
					onchange={(e) => {
						const val = e.currentTarget.value;
						handleYearChange(val ? Number(val) : null);
					}}
				>
					<option value="">Custom</option>
					{#each yearOptions as year}
						<option value={year}>{year}</option>
					{/each}
				</select>
			</label>
			<label class="form-group">
				<span class="label">Start</span>
				<input
					type="date"
					class="input"
					bind:value={startDate}
					oninput={handleDateChange}
				/>
			</label>
			<label class="form-group">
				<span class="label">End</span>
				<input
					type="date"
					class="input"
					bind:value={endDate}
					oninput={handleDateChange}
				/>
			</label>
		</div>
	</div>

	<div class="config-section">
		<h3>Personnel</h3>
		<div class="filter-mode-row">
			<label class="form-group">
				<span class="label">Filter by</span>
				<select class="select" bind:value={filterMode}>
					<option value="all">All Personnel</option>
					<option value="name">By Name</option>
					<option value="group">By Group</option>
					{#if uniqueMosCodes.length > 0}
						<option value="mos">By MOS</option>
					{/if}
					{#if uniqueRoles.length > 0}
						<option value="role">By Role</option>
					{/if}
				</select>
			</label>
		</div>

		{#if filterMode === 'name'}
			<div class="filter-panel">
				<input
					type="text"
					class="input"
					placeholder="Search by name..."
					bind:value={nameSearch}
				/>
				<div class="checkbox-list">
					{#each nameFilteredPersonnel as person (person.id)}
						<label class="checkbox-item">
							<input
								type="checkbox"
								checked={selectedPersonnelIds.has(person.id)}
								onchange={() => (selectedPersonnelIds = toggleSet(selectedPersonnelIds, person.id))}
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
								onchange={() => (selectedGroupIds = toggleSet(selectedGroupIds, group.id))}
							/>
							<span>{group.name}</span>
						</label>
					{/each}
				</div>
			</div>
		{:else if filterMode === 'mos'}
			<div class="filter-panel">
				<div class="checkbox-list">
					{#each uniqueMosCodes as mos}
						<label class="checkbox-item">
							<input
								type="checkbox"
								checked={selectedMosCodes.has(mos)}
								onchange={() => (selectedMosCodes = toggleSet(selectedMosCodes, mos))}
							/>
							<span>{mos}</span>
						</label>
					{/each}
				</div>
			</div>
		{:else if filterMode === 'role'}
			<div class="filter-panel">
				<div class="checkbox-list">
					{#each uniqueRoles as role}
						<label class="checkbox-item">
							<input
								type="checkbox"
								checked={selectedRoles.has(role)}
								onchange={() => (selectedRoles = toggleSet(selectedRoles, role))}
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
			<button class="btn btn-sm btn-secondary" onclick={toggleAllStatuses}>
				{selectedStatusTypeIds.size === statusTypes.length ? 'Deselect All' : 'Select All'}
			</button>
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
					onclick={() => (selectedStatusTypeIds = toggleSet(selectedStatusTypeIds, st.id))}
				>
					{st.name}
				</button>
			{/each}
		</div>
	</div>

	<div class="config-actions">
		<button class="btn btn-primary" onclick={runReport} disabled={loading || !startDate || !endDate || selectedStatusTypeIds.size === 0}>
			{#if loading}<Spinner />{/if}
			{loading ? 'Generating...' : 'Generate Report'}
		</button>
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
			<button class="btn btn-secondary btn-sm" onclick={handleExportCsv}>
				Export CSV
			</button>
		</div>

		{#if result.rows.length === 0}
			<p class="no-data">No data found for the selected criteria.</p>
		{:else}
			<div class="table-wrapper">
				<table class="report-table">
					<thead>
						<tr>
							<th class="col-rank">Rank</th>
							<th class="col-name">Name</th>
							{#each displayColumns as st (st.id)}
								<th class="col-status">
									<Badge label={st.name} color={st.color} textColor={st.textColor} />
								</th>
							{/each}
							<th class="col-total">Total Days</th>
						</tr>
					</thead>
					<tbody>
						{#each result.rows as row (row.person.id)}
							<tr>
								<td class="col-rank">{row.person.rank}</td>
								<td class="col-name">{row.person.lastName}, {row.person.firstName}</td>
								{#each displayColumns as st (st.id)}
									<td class="col-status">
										{(row.statusDays.get(st.id) ?? 0) > 0 ? row.statusDays.get(st.id) : '\u2014'}
									</td>
								{/each}
								<td class="col-total">{row.totalDays > 0 ? row.totalDays : '\u2014'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
{/if}

<style>
	.report-config {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--spacing-md);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.config-section h3 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0 0 var(--spacing-sm) 0;
	}

	.date-row {
		display: flex;
		gap: var(--spacing-sm);
		align-items: flex-end;
		flex-wrap: wrap;
	}

	.date-row .form-group {
		flex: 1;
		min-width: 120px;
	}

	.filter-mode-row {
		margin-bottom: var(--spacing-sm);
	}

	.filter-mode-row .form-group {
		max-width: 200px;
	}

	.filter-panel {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.checkbox-list {
		max-height: 200px;
		overflow-y: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: var(--spacing-xs);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.checkbox-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		font-size: var(--font-size-sm);
		cursor: pointer;
	}

	.checkbox-item:hover {
		background: var(--color-bg);
	}

	.personnel-count {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin-top: var(--spacing-xs);
	}

	.status-filter-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-sm);
	}

	.status-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
	}

	.status-chip {
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-full);
		font-size: var(--font-size-sm);
		cursor: pointer;
		border: 2px solid var(--chip-color);
		background: transparent;
		color: var(--color-text);
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
		color: var(--color-error);
		font-size: var(--font-size-sm);
		padding: var(--spacing-sm);
		background: color-mix(in srgb, var(--color-error) 10%, transparent);
		border-radius: var(--radius-sm);
		margin-top: var(--spacing-sm);
	}

	.report-output {
		margin-top: var(--spacing-md);
	}

	.report-toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--spacing-sm);
	}

	.report-summary {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}

	.no-data {
		text-align: center;
		color: var(--color-text-muted);
		padding: var(--spacing-xl);
		font-style: italic;
	}

	.table-wrapper {
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
		background: var(--color-surface-variant);
		padding: var(--spacing-sm);
		text-align: left;
		font-weight: 600;
		border-bottom: 2px solid var(--color-border);
		white-space: nowrap;
	}

	.report-table td {
		padding: var(--spacing-sm);
		border-bottom: 1px solid var(--color-border);
	}

	.report-table tbody tr:hover {
		background: var(--color-bg);
	}

	.col-rank {
		width: 60px;
		font-weight: 600;
		color: var(--color-primary);
	}

	.col-name {
		min-width: 150px;
	}

	.col-status {
		text-align: center;
		min-width: 80px;
	}

	.col-total {
		text-align: center;
		font-weight: 600;
		min-width: 80px;
	}

	@media (max-width: 640px) {
		.date-row {
			flex-direction: column;
		}

		.date-row .form-group {
			min-width: unset;
		}
	}
</style>
