<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { AssignmentType, DailyAssignment } from '../../stores/dailyAssignments.svelte';
	import type { AssignmentCoverageResult } from '../../utils/calendarReports';
	import { computeAssignmentCoverage } from '../../utils/calendarReports';
	import Spinner from '$lib/components/ui/Spinner.svelte';

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
	let selectedTypeIds = $state<Set<string>>(new Set());

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
		if (!result || result.rows.length === 0) return new Map<string, number>();
		const map = new Map<string, number>();
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
			selectedTypeIds = new Set(personnelTypes.map((t) => t.id));

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
		const next = new Set(selectedTypeIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedTypeIds = next;
		recompute();
	}

	function toggleAllTypes() {
		if (selectedTypeIds.size === personnelAssignmentTypes.length) {
			selectedTypeIds = new Set();
		} else {
			selectedTypeIds = new Set(personnelAssignmentTypes.map((t) => t.id));
		}
		recompute();
	}

	function handleExportCsv() {
		if (!result) return;

		const headers = ['Rank', 'Last Name', 'First Name'];
		for (const t of displayTypes) {
			headers.push(t.name);
		}
		headers.push('Total', 'vs Avg');

		const lines = [headers.join(',')];

		for (const row of result.rows) {
			const vsAvg = Math.round((row.totalAssignments - result.averageTotal) * 10) / 10;
			const vsAvgStr = vsAvg > 0 ? `+${vsAvg}` : vsAvg === 0 ? '0' : `${vsAvg}`;
			const cols = [`"${row.person.rank}"`, `"${row.person.lastName}"`, `"${row.person.firstName}"`];
			for (const t of displayTypes) {
				cols.push(`${row.assignmentCounts.get(t.id) ?? 0}`);
			}
			cols.push(`${row.totalAssignments}`, `${vsAvgStr}`);
			lines.push(cols.join(','));
		}

		// Average row
		const avgCols = ['', '', 'Average'];
		for (const t of displayTypes) {
			avgCols.push(`${averageByType.get(t.id) ?? 0}`);
		}
		avgCols.push(`${result.averageTotal}`, '');
		lines.push(avgCols.join(','));

		const csv = lines.join('\n');
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `assignment-coverage_${startDate}_${endDate}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}
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
				<input type="date" class="input" bind:value={startDate} oninput={handleDateChange} />
			</label>
			<label class="form-group">
				<span class="label">End</span>
				<input type="date" class="input" bind:value={endDate} oninput={handleDateChange} />
			</label>
		</div>
	</div>

	<div class="config-actions">
		<button class="btn btn-primary" onclick={runReport} disabled={loading || !startDate || !endDate}>
			{#if loading}<Spinner />{/if}
			{loading ? 'Generating...' : 'Generate Report'}
		</button>
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
				<button class="btn btn-sm btn-secondary" onclick={toggleAllTypes}>
					{selectedTypeIds.size === personnelAssignmentTypes.length ? 'Deselect All' : 'Select All'}
				</button>
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
			<button class="btn btn-secondary btn-sm" onclick={handleExportCsv}> Export CSV </button>
		</div>

		{#if result.rows.length === 0 || displayTypes.length === 0}
			<p class="no-data">No assignment data found for the selected criteria.</p>
		{:else}
			<div class="table-wrapper">
				<table class="report-table">
					<thead>
						<tr>
							<th class="col-rank">Rank</th>
							<th class="col-name">Name</th>
							{#each displayTypes as at (at.id)}
								<th class="col-data">
									<span class="col-header-badge" style:background={at.color}>{at.name}</span>
								</th>
							{/each}
							<th class="col-data col-total">Total</th>
							<th class="col-data col-vs-avg">vs Avg</th>
						</tr>
					</thead>
					<tbody>
						{#each result.rows as row (row.person.id)}
							{@const vsAvg = Math.round((row.totalAssignments - result.averageTotal) * 10) / 10}
							<tr>
								<td class="col-rank">{row.person.rank}</td>
								<td class="col-name">{row.person.lastName}, {row.person.firstName}</td>
								{#each displayTypes as at (at.id)}
									<td class="col-data">
										{(row.assignmentCounts.get(at.id) ?? 0) > 0 ? row.assignmentCounts.get(at.id) : ''}
									</td>
								{/each}
								<td class="col-data col-total">{row.totalAssignments > 0 ? row.totalAssignments : ''}</td>
								<td class="col-data col-vs-avg">
									{#if vsAvg > 0}
										<span class="vs-above">+{vsAvg}</span>
									{:else if vsAvg < 0}
										<span class="vs-below">{vsAvg}</span>
									{:else}
										<span class="vs-even">0</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr class="avg-row">
							<td class="col-rank"></td>
							<td class="col-name avg-label">Average</td>
							{#each displayTypes as at (at.id)}
								<td class="col-data">{averageByType.get(at.id) ?? 0}</td>
							{/each}
							<td class="col-data col-total">{result.averageTotal}</td>
							<td class="col-data col-vs-avg"></td>
						</tr>
					</tfoot>
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

	.type-filter {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--spacing-md);
		margin-top: var(--spacing-md);
	}

	.type-filter-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-sm);
	}

	.type-filter-header h3 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0;
	}

	.filter-count {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin-left: auto;
	}

	.type-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
	}

	.type-chip {
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-full);
		font-size: var(--font-size-sm);
		cursor: pointer;
		border: 2px solid var(--chip-color);
		background: transparent;
		color: var(--color-text);
		transition: all 0.15s ease;
	}

	.type-chip.selected {
		background: var(--chip-color);
		color: white;
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
		text-align: center;
		font-weight: 600;
		border-bottom: 2px solid var(--color-border);
		white-space: nowrap;
	}

	.report-table td {
		padding: var(--spacing-sm);
		border-bottom: 1px solid var(--color-border);
		text-align: center;
	}

	.report-table tbody tr:nth-child(even) {
		background: var(--color-surface-variant);
	}

	.report-table tbody tr:hover {
		background: var(--color-bg);
	}

	.col-rank {
		width: 60px;
		font-weight: 600;
		color: var(--color-primary);
		text-align: left;
	}

	.col-name {
		min-width: 150px;
		text-align: left;
	}

	.col-data {
		text-align: center;
		min-width: 80px;
	}

	.col-total {
		font-weight: 600;
	}

	.col-vs-avg {
		min-width: 70px;
	}

	.col-header-badge {
		display: inline-block;
		padding: 2px var(--spacing-sm);
		border-radius: var(--radius-full);
		color: white;
		font-size: var(--font-size-xs);
		font-weight: 600;
	}

	.vs-above {
		color: var(--color-success);
		font-weight: 600;
	}

	.vs-below {
		color: var(--color-error);
		font-weight: 600;
	}

	.vs-even {
		color: var(--color-text-muted);
	}

	.avg-row {
		background: var(--color-surface-variant) !important;
		border-top: 2px solid var(--color-border);
	}

	.avg-row td {
		font-weight: 600;
		font-style: italic;
	}

	.avg-label {
		text-align: left;
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
