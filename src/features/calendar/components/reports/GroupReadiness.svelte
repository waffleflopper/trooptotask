<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { StatusType } from '$lib/types';
	import type { GroupReadinessResult, ReadinessGroupRow } from '../../utils/calendarReports';
	import { computeGroupReadiness } from '../../utils/calendarReports';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { useDataTable } from '$lib/components/ui/data-table/useDataTable.svelte';
	import type { ColumnDef } from '$lib/components/ui/data-table/useDataTable.svelte';

	interface Props {
		orgId: string;
		personnel: Personnel[];
		statusTypes: StatusType[];
		groups: { id: string; name: string }[];
	}

	let { orgId, personnel, statusTypes, groups }: Props = $props();

	// --- Helpers ---

	function getMonday(d: Date): Date {
		const date = new Date(d);
		const day = date.getDay();
		const diff = date.getDate() - day + (day === 0 ? -6 : 1);
		date.setDate(diff);
		return date;
	}

	function formatDateStr(d: Date): string {
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	function formatShortDate(dateStr: string): string {
		const d = new Date(dateStr + 'T00:00:00');
		return `${dayNames[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
	}

	// --- Date range state ---

	const today = new Date();
	const monday = getMonday(today);
	const sunday = new Date(monday);
	sunday.setDate(sunday.getDate() + 6);

	let startDate = $state(formatDateStr(monday));
	let endDate = $state(formatDateStr(sunday));

	function setThisWeek() {
		const mon = getMonday(new Date());
		const sun = new Date(mon);
		sun.setDate(sun.getDate() + 6);
		startDate = formatDateStr(mon);
		endDate = formatDateStr(sun);
	}

	function setNextWeek() {
		const mon = getMonday(new Date());
		mon.setDate(mon.getDate() + 7);
		const sun = new Date(mon);
		sun.setDate(sun.getDate() + 6);
		startDate = formatDateStr(mon);
		endDate = formatDateStr(sun);
	}

	function setNext2Weeks() {
		const mon = getMonday(new Date());
		mon.setDate(mon.getDate() + 7);
		const sun = new Date(mon);
		sun.setDate(sun.getDate() + 13);
		startDate = formatDateStr(mon);
		endDate = formatDateStr(sun);
	}

	function setThisMonth() {
		const now = new Date();
		const first = new Date(now.getFullYear(), now.getMonth(), 1);
		const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
		startDate = formatDateStr(first);
		endDate = formatDateStr(last);
	}

	// --- Group selection state ---

	let selectedGroupIds = $state<Set<string>>(new Set(groups.map((g) => g.id)));

	function toggleGroup(id: string) {
		const next = new Set(selectedGroupIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedGroupIds = next;
	}

	function toggleAllGroups() {
		if (selectedGroupIds.size === groups.length) {
			selectedGroupIds = new Set();
		} else {
			selectedGroupIds = new Set(groups.map((g) => g.id));
		}
	}

	// --- Report execution ---

	let loading = $state(false);
	let result = $state<GroupReadinessResult | null>(null);
	let errorMsg = $state('');

	async function runReport() {
		if (!startDate || !endDate) return;
		if (selectedGroupIds.size === 0) {
			errorMsg = 'No groups selected.';
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
			result = computeGroupReadiness(personnel, data.entries, groups, selectedGroupIds, startDate, endDate);
		} catch (e: unknown) {
			errorMsg = e instanceof Error ? e.message : 'Failed to generate report.';
		} finally {
			loading = false;
		}
	}

	// --- CSV Export ---

	function handleExportCsv() {
		if (!result) return;

		const headers = ['Group', ...result.dates.map(formatShortDate)];
		const rows = result.groups.map((group) => {
			const cells = group.cells.map((cell) => {
				const pct = cell.totalPersonnel > 0 ? cell.availablePercent : 100;
				return `${cell.availableCount}/${cell.totalPersonnel} (${pct}%)`;
			});
			return [group.groupName, ...cells];
		});

		const csvContent = [headers, ...rows]
			.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
			.join('\n');

		const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `group-readiness_${startDate}_${endDate}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	// --- Cell color helper ---

	function cellBackground(percent: number): string {
		if (percent >= 80) return 'color-mix(in srgb, var(--color-success) 15%, transparent)';
		if (percent >= 50) return 'color-mix(in srgb, var(--color-warning) 15%, transparent)';
		return 'color-mix(in srgb, var(--color-error) 15%, transparent)';
	}

	// --- useDataTable for sorting ---
	const columns: ColumnDef<ReadinessGroupRow>[] = [
		{
			key: 'groupName',
			header: 'Group',
			value: (r) => r.groupName,
			compare: (a, b) => a.groupName.localeCompare(b.groupName)
		}
	];

	const table = useDataTable({
		data: () => result?.groups ?? [],
		columns,
		initialSortKey: 'groupName'
	});
</script>

<div class="report-config">
	<div class="config-section">
		<h3>Date Range</h3>
		<div class="date-row">
			<label class="form-group">
				<span class="label">Start</span>
				<input type="date" class="input" bind:value={startDate} />
			</label>
			<label class="form-group">
				<span class="label">End</span>
				<input type="date" class="input" bind:value={endDate} />
			</label>
		</div>
		<div class="quick-range-row">
			<button class="btn btn-sm btn-secondary" onclick={setThisWeek}>This Week</button>
			<button class="btn btn-sm btn-secondary" onclick={setNextWeek}>Next Week</button>
			<button class="btn btn-sm btn-secondary" onclick={setNext2Weeks}>Next 2 Weeks</button>
			<button class="btn btn-sm btn-secondary" onclick={setThisMonth}>This Month</button>
		</div>
	</div>

	<div class="config-section">
		<h3>Groups</h3>
		<div class="group-filter-header">
			<button class="btn btn-sm btn-secondary" onclick={toggleAllGroups}>
				{selectedGroupIds.size === groups.length ? 'Deselect All' : 'Select All'}
			</button>
			<span class="selection-count">
				{selectedGroupIds.size} of {groups.length} selected
			</span>
		</div>
		<div class="checkbox-list">
			{#each groups as group (group.id)}
				<label class="checkbox-item">
					<input type="checkbox" checked={selectedGroupIds.has(group.id)} onchange={() => toggleGroup(group.id)} />
					<span>{group.name}</span>
				</label>
			{/each}
		</div>
	</div>

	<div class="config-actions">
		<button
			class="btn btn-primary"
			onclick={runReport}
			disabled={loading || !startDate || !endDate || selectedGroupIds.size === 0}
		>
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
				{result.groups.length} groups &middot; {startDate} to {endDate}
			</span>
			<button class="btn btn-secondary btn-sm" onclick={handleExportCsv}> Export CSV </button>
		</div>

		{#if result.groups.length === 0}
			<p class="no-data">No data found for the selected criteria.</p>
		{:else}
			<div class="data-table compact">
				<table aria-label="Group readiness heat map">
					<thead>
						<tr>
							<th class="col-group" onclick={() => table.toggleSort('groupName')}>Group</th>
							{#each result.dates as dateStr}
								<th class="col-date">{formatShortDate(dateStr)}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each table.rows as group (group.groupId)}
							<tr>
								<td class="col-group">{group.groupName}</td>
								{#each group.cells as cell}
									<td class="col-date" style:background={cellBackground(cell.availablePercent)}>
										{cell.availableCount}/{cell.totalPersonnel}
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

	.quick-range-row {
		display: flex;
		gap: var(--spacing-xs);
		flex-wrap: wrap;
		margin-top: var(--spacing-sm);
	}

	.group-filter-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-sm);
	}

	.selection-count {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
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

	/* DataTable-compatible table styles */
	.data-table {
		overflow-x: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--font-size-sm);
	}

	thead {
		background: var(--color-surface-variant);
	}

	th {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-bottom: 2px solid var(--color-border);
		cursor: pointer;
		user-select: none;
		white-space: nowrap;
		background: var(--color-surface-variant);
		text-align: center;
	}

	th:hover {
		color: var(--color-text);
	}

	td {
		padding: var(--spacing-xs) var(--spacing-sm);
		border-bottom: 1px solid var(--color-divider);
		color: var(--color-text);
		text-align: center;
		white-space: nowrap;
	}

	tbody tr:last-child td {
		border-bottom: none;
	}

	.col-group {
		text-align: left;
		min-width: 150px;
		font-weight: 600;
	}

	.col-date {
		min-width: 80px;
	}

	@media (max-width: 640px) {
		.date-row {
			flex-direction: column;
		}

		.date-row .form-group {
			min-width: unset;
		}

		.quick-range-row {
			flex-direction: column;
		}

		th,
		td {
			padding: var(--spacing-xs) var(--spacing-sm);
			font-size: var(--font-size-sm);
		}
	}
</style>
