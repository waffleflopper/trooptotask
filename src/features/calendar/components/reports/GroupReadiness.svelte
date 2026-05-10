<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { StatusType } from '$lib/types';
	import type { GroupReadinessResult, ReadinessGroupRow } from '../../utils/calendarReports';
	import { computeGroupReadiness } from '../../utils/calendarReports';
	import { Button } from '$lib/components/ui/button';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Spinner } from '$lib/components/ui/spinner';
	import { useDataTable } from '$lib/components/ui/data-table';
	import type { ColumnDef } from '$lib/components/ui/data-table';
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';

	interface Props {
		orgId: string;
		personnel: Personnel[];
		statusTypes: StatusType[];
		groups: { id: string; name: string }[];
	}

	let { orgId, personnel, groups }: Props = $props();

	// --- Helpers ---

	function getMonday(d: Date): Date {
		const day = d.getDay();
		const diff = d.getDate() - day + (day === 0 ? -6 : 1);
		return new Date(d.getFullYear(), d.getMonth(), diff);
	}

	function addDays(d: Date, days: number): Date {
		return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
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
	const sunday = addDays(monday, 6);

	let startDate = $state(formatDateStr(monday));
	let endDate = $state(formatDateStr(sunday));

	function setThisWeek() {
		const mon = getMonday(new Date());
		const sun = addDays(mon, 6);
		startDate = formatDateStr(mon);
		endDate = formatDateStr(sun);
	}

	function setNextWeek() {
		const mon = getMonday(new Date());
		const nextMon = addDays(mon, 7);
		const sun = addDays(nextMon, 6);
		startDate = formatDateStr(nextMon);
		endDate = formatDateStr(sun);
	}

	function setNext2Weeks() {
		const mon = getMonday(new Date());
		const nextMon = addDays(mon, 7);
		const sun = addDays(nextMon, 13);
		startDate = formatDateStr(nextMon);
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

	const selectedGroupIds = new SvelteSet<string>();
	let previousGroupIds: string[] = [];

	$effect(() => {
		const currentGroupIds = groups.map((g) => g.id);
		const currentGroupIdSet = new SvelteSet(currentGroupIds);

		untrack(() => {
			const selectedAllPrevious =
				previousGroupIds.length > 0 && previousGroupIds.every((id) => selectedGroupIds.has(id));
			const shouldSelectAll = (previousGroupIds.length === 0 && selectedGroupIds.size === 0) || selectedAllPrevious;

			if (shouldSelectAll) {
				selectedGroupIds.clear();
				for (const id of currentGroupIds) selectedGroupIds.add(id);
			} else {
				const selectedExistingIds = [...selectedGroupIds].filter((id) => currentGroupIdSet.has(id));
				if (selectedExistingIds.length !== selectedGroupIds.size) {
					selectedGroupIds.clear();
					for (const id of selectedExistingIds) selectedGroupIds.add(id);
				}
			}

			previousGroupIds = currentGroupIds;
		});
	});

	function toggleGroup(id: string) {
		if (selectedGroupIds.has(id)) selectedGroupIds.delete(id);
		else selectedGroupIds.add(id);
	}

	function toggleAllGroups() {
		if (selectedGroupIds.size === groups.length) {
			selectedGroupIds.clear();
		} else {
			selectedGroupIds.clear();
			for (const group of groups) selectedGroupIds.add(group.id);
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
		if (percent >= 80) return 'color-mix(in srgb, var(--success) 15%, transparent)';
		if (percent >= 50) return 'color-mix(in srgb, var(--amber-dark) 15%, transparent)';
		return 'color-mix(in srgb, var(--danger) 15%, transparent)';
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
			<Field.Root>
				<Field.Label>Start</Field.Label>
				<DatePicker bind:value={startDate} placeholder="Select start date" />
			</Field.Root>
			<Field.Root>
				<Field.Label>End</Field.Label>
				<DatePicker bind:value={endDate} placeholder="Select end date" />
			</Field.Root>
		</div>
		<div class="quick-range-row">
			<Button variant="outline" size="sm" onclick={setThisWeek}>This Week</Button>
			<Button variant="outline" size="sm" onclick={setNextWeek}>Next Week</Button>
			<Button variant="outline" size="sm" onclick={setNext2Weeks}>Next 2 Weeks</Button>
			<Button variant="outline" size="sm" onclick={setThisMonth}>This Month</Button>
		</div>
	</div>

	<div class="config-section">
		<h3>Groups</h3>
		<div class="group-filter-header">
			<Button variant="outline" size="sm" onclick={toggleAllGroups}>
				{selectedGroupIds.size === groups.length ? 'Deselect All' : 'Select All'}
			</Button>
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
		<Button onclick={runReport} disabled={loading || !startDate || !endDate || selectedGroupIds.size === 0}>
			{#if loading}<Spinner />{/if}
			{loading ? 'Generating...' : 'Generate Report'}
		</Button>
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
			<Button variant="outline" size="sm" onclick={handleExportCsv}>Export CSV</Button>
		</div>

		{#if result.groups.length === 0}
			<p class="no-data">No data found for the selected criteria.</p>
		{:else}
			<div class="data-table compact">
				<table aria-label="Group readiness heat map">
					<thead>
						<tr>
							<th class="col-group" onclick={() => table.toggleSort('groupName')}>Group</th>
							{#each result.dates as dateStr (dateStr)}
								<th class="col-date">{formatShortDate(dateStr)}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each table.rows as group (group.groupId)}
							<tr>
								<td class="col-group">{group.groupName}</td>
								{#each group.cells as cell (cell.date)}
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
		background: var(--surface-panel);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		padding: var(--sp-4);
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.config-section h3 {
		font-size: var(--text-ui-sm);
		font-weight: 600;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0 0 var(--sp-2) 0;
	}

	.date-row {
		display: flex;
		gap: var(--sp-2);
		align-items: flex-end;
		flex-wrap: wrap;
	}

	.quick-range-row {
		display: flex;
		gap: var(--sp-1);
		flex-wrap: wrap;
		margin-top: var(--sp-2);
	}

	.group-filter-header {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin-bottom: var(--sp-2);
	}

	.selection-count {
		font-size: var(--text-ui-sm);
		color: var(--text-tertiary);
	}

	.checkbox-list {
		max-height: 200px;
		overflow-y: auto;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		padding: var(--sp-1);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.checkbox-item {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-1) var(--sp-2);
		border-radius: var(--radius-sm);
		font-size: var(--text-ui-sm);
		cursor: pointer;
	}

	.checkbox-item:hover {
		background: var(--surface-page);
	}

	.config-actions {
		display: flex;
		justify-content: flex-end;
	}

	.report-error {
		color: var(--danger);
		font-size: var(--text-ui-sm);
		padding: var(--sp-2);
		background: color-mix(in srgb, var(--danger) 10%, transparent);
		border-radius: var(--radius-sm);
		margin-top: var(--sp-2);
	}

	.report-output {
		margin-top: var(--sp-4);
	}

	.report-toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--sp-2);
	}

	.report-summary {
		font-size: var(--text-ui-sm);
		color: var(--text-secondary);
	}

	.no-data {
		text-align: center;
		color: var(--text-tertiary);
		padding: var(--sp-8);
		font-style: italic;
	}

	/* DataTable-compatible table styles */
	.data-table {
		overflow-x: auto;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-ui-sm);
	}

	thead {
		background: var(--surface-subtle);
	}

	th {
		padding: var(--sp-1) var(--sp-2);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		color: var(--text-tertiary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-bottom: 2px solid var(--border-default);
		cursor: pointer;
		user-select: none;
		white-space: nowrap;
		background: var(--surface-subtle);
		text-align: center;
	}

	th:hover {
		color: var(--text-primary);
	}

	td {
		padding: var(--sp-1) var(--sp-2);
		border-bottom: 1px solid var(--divider-color);
		color: var(--text-primary);
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

		.quick-range-row {
			flex-direction: column;
		}

		th,
		td {
			padding: var(--sp-1) var(--sp-2);
			font-size: var(--text-ui-sm);
		}
	}
</style>
