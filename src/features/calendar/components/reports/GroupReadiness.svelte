<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { StatusType } from '$lib/types';
	import type { GroupReadinessResult, ReadinessGroupRow } from '../../utils/calendarReports';
	import { computeGroupReadiness } from '../../utils/calendarReports';
	import { exportGroupReadinessWorkbook } from './calendarReportWorkbookExport';
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

	function handleExportExcel() {
		if (!result) return;
		return exportGroupReadinessWorkbook(result, startDate, endDate);
	}

	// --- Cell color helper ---

	function cellBackground(percent: number): string {
		if (percent >= 80) return 'color-mix(in srgb, var(--chart-2) 15%, transparent)';
		if (percent >= 50) return 'color-mix(in srgb, var(--accent) 15%, transparent)';
		return 'color-mix(in srgb, var(--destructive) 15%, transparent)';
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
			<Button variant="outline" size="sm" onclick={handleExportExcel}>Export Excel</Button>
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
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.config-section h3 {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--muted-foreground);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0 0 0.5rem 0;
	}

	.date-row {
		display: flex;
		gap: 0.5rem;
		align-items: flex-end;
		flex-wrap: wrap;
	}

	.quick-range-row {
		display: flex;
		gap: 0.25rem;
		flex-wrap: wrap;
		margin-top: 0.5rem;
	}

	.group-filter-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.selection-count {
		font-size: 0.75rem;
		color: var(--muted-foreground);
	}

	.checkbox-list {
		max-height: 200px;
		overflow-y: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.25rem;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.checkbox-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.5rem;
		border-radius: var(--radius);
		font-size: 0.75rem;
		cursor: pointer;
	}

	.checkbox-item:hover {
		background: var(--background);
	}

	.config-actions {
		display: flex;
		justify-content: flex-end;
	}

	.report-error {
		color: var(--destructive);
		font-size: 0.75rem;
		padding: 0.5rem;
		background: color-mix(in srgb, var(--destructive) 10%, transparent);
		border-radius: var(--radius);
		margin-top: 0.5rem;
	}

	.report-output {
		margin-top: 1rem;
	}

	.report-toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.report-summary {
		font-size: 0.75rem;
		color: var(--muted-foreground);
	}

	.no-data {
		text-align: center;
		color: var(--muted-foreground);
		padding: 2rem;
		font-style: italic;
	}

	/* DataTable-compatible table styles */
	.data-table {
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--card);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.75rem;
	}

	thead {
		background: var(--muted);
	}

	th {
		padding: 0.25rem 0.5rem;
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--muted-foreground);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-bottom: 2px solid var(--border);
		cursor: pointer;
		user-select: none;
		white-space: nowrap;
		background: var(--muted);
		text-align: center;
	}

	th:hover {
		color: var(--foreground);
	}

	td {
		padding: 0.25rem 0.5rem;
		border-bottom: 1px solid color-mix(in srgb, var(--foreground) 8%, transparent);
		color: var(--foreground);
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
			padding: 0.25rem 0.5rem;
			font-size: 0.75rem;
		}
	}
</style>
