<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { StatusType } from '$lib/types';
	import type { AvailabilityForecastResult, ForecastDay } from '../../utils/calendarReports';
	import { computeAvailabilityForecast } from '../../utils/calendarReports';
	import Badge from '$lib/components/ui/Badge.svelte';
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

	// --- Date range state ---
	const today = new Date();
	const thirtyDaysFromNow = new Date(today);
	thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

	function formatDate(d: Date): string {
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	let startDate = $state(formatDate(today));
	let endDate = $state(formatDate(thirtyDaysFromNow));

	// --- Group filter state ---
	let selectedGroupIds = $state<Set<string>>(new Set());

	const filteredPersonnel = $derived.by(() => {
		if (selectedGroupIds.size === 0) return personnel;
		return personnel.filter((p) => p.groupId && selectedGroupIds.has(p.groupId));
	});

	// --- Report execution ---
	let loading = $state(false);
	let result = $state<AvailabilityForecastResult | null>(null);
	let errorMsg = $state('');

	// --- Expandable rows ---
	let expandedDates = $state<Set<string>>(new Set());

	function toggleExpanded(date: string) {
		const next = new Set(expandedDates);
		if (next.has(date)) next.delete(date);
		else next.add(date);
		expandedDates = next;
	}

	function toggleGroup(groupId: string) {
		const next = new Set(selectedGroupIds);
		if (next.has(groupId)) next.delete(groupId);
		else next.add(groupId);
		selectedGroupIds = next;
	}

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
		expandedDates = new Set();

		try {
			const res = await fetch(
				`/org/${orgId}/api/calendar-reports/status-days?startDate=${startDate}&endDate=${endDate}`
			);
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message || `Request failed (${res.status})`);
			}
			const data = await res.json();
			result = computeAvailabilityForecast(filteredPersonnel, data.entries, statusTypes, startDate, endDate);
		} catch (e: unknown) {
			errorMsg = e instanceof Error ? e.message : 'Failed to generate report.';
		} finally {
			loading = false;
		}
	}

	function formatDisplayDate(dateStr: string): string {
		const [year, month, day] = dateStr.split('-');
		const d = new Date(Number(year), Number(month) - 1, Number(day));
		const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
		return `${weekday}, ${month}/${day}/${year}`;
	}

	function handleExportCsv() {
		if (!result) return;

		const headers = ['Date', 'Unavailable', 'Available', 'Available %', 'Unavailable Personnel'];
		const rows = result.days.map((day) => {
			const unavailableNames = day.unavailablePersonnel.map((u) => `${u.person.rank} ${u.person.lastName}`).join(', ');
			return [
				day.date,
				String(day.unavailableCount),
				String(day.availableCount),
				`${day.availablePercent}%`,
				`"${unavailableNames}"`
			].join(',');
		});

		const csv = [headers.join(','), ...rows].join('\n');
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `availability-forecast_${startDate}_${endDate}.csv`;
		link.click();
		URL.revokeObjectURL(url);
	}

	// --- useDataTable for sorting ---
	const tableColumns: ColumnDef<ForecastDay>[] = [
		{
			key: 'date',
			header: 'Date',
			value: (r) => r.date
		},
		{
			key: 'unavailable',
			header: 'Unavailable',
			value: (r) => r.unavailableCount,
			compare: (a, b) => a.unavailableCount - b.unavailableCount
		},
		{
			key: 'available',
			header: 'Available',
			value: (r) => r.availableCount,
			compare: (a, b) => a.availableCount - b.availableCount
		},
		{
			key: 'percent',
			header: 'Available %',
			value: (r) => r.availablePercent,
			compare: (a, b) => a.availablePercent - b.availablePercent
		}
	];

	const table = useDataTable({
		data: () => result?.days ?? [],
		columns: tableColumns,
		initialSortKey: 'date'
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
	</div>

	<div class="config-section">
		<h3>Group Filter</h3>
		<div class="checkbox-list">
			{#each groups as group (group.id)}
				<label class="checkbox-item">
					<input type="checkbox" checked={selectedGroupIds.has(group.id)} onchange={() => toggleGroup(group.id)} />
					<span>{group.name}</span>
				</label>
			{/each}
		</div>
		<div class="personnel-count">
			{filteredPersonnel.length} of {personnel.length} personnel selected
			{#if selectedGroupIds.size === 0}
				(all)
			{/if}
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
	<div class="report-output">
		<div class="report-toolbar">
			<span class="report-summary">
				{result.days.length} days &middot; {filteredPersonnel.length} personnel &middot; {startDate} to {endDate}
			</span>
			<button class="btn btn-secondary btn-sm" onclick={handleExportCsv}> Export CSV </button>
		</div>

		{#if result.days.length === 0}
			<p class="no-data">No data found for the selected criteria.</p>
		{:else}
			<div class="data-table compact">
				<table aria-label="Availability forecast">
					<thead>
						<tr>
							<th class="col-date" onclick={() => table.toggleSort('date')}>Date</th>
							<th class="col-data" onclick={() => table.toggleSort('unavailable')}>Unavailable</th>
							<th class="col-data" onclick={() => table.toggleSort('available')}>Available</th>
							<th class="col-data" onclick={() => table.toggleSort('percent')}>Available %</th>
						</tr>
					</thead>
					<tbody>
						{#each table.rows as day (day.date)}
							<tr
								class="forecast-row"
								class:expandable={day.unavailableCount > 0}
								onclick={() => day.unavailableCount > 0 && toggleExpanded(day.date)}
							>
								<td class="col-date">
									{#if day.unavailableCount > 0}
										<span class="expand-icon">{expandedDates.has(day.date) ? '▾' : '▸'}</span>
									{/if}
									{formatDisplayDate(day.date)}
								</td>
								<td class="col-data">{day.unavailableCount}</td>
								<td class="col-data">{day.availableCount}</td>
								<td class="col-data">
									<span
										class="pct-value"
										class:pct-green={day.availablePercent >= 80}
										class:pct-orange={day.availablePercent >= 50 && day.availablePercent < 80}
										class:pct-red={day.availablePercent < 50}
									>
										{day.availablePercent}%
									</span>
								</td>
							</tr>
							{#if expandedDates.has(day.date)}
								<tr class="detail-row">
									<td colspan="4">
										<div class="detail-content">
											{#each day.unavailablePersonnel as entry (entry.person.id)}
												<span class="detail-person">
													<span class="detail-name"
														>{entry.person.rank} {entry.person.lastName}, {entry.person.firstName}</span
													>
													<Badge label={entry.statusName} color={entry.statusColor} />
												</span>
											{/each}
										</div>
									</td>
								</tr>
							{/if}
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

	.date-row .form-group {
		flex: 1;
		min-width: 120px;
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

	.personnel-count {
		font-size: var(--text-ui-sm);
		color: var(--text-tertiary);
		margin-top: var(--sp-1);
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
	}

	tbody tr:last-child td {
		border-bottom: none;
	}

	.forecast-row:nth-child(odd) {
		background: var(--surface-subtle);
	}

	.forecast-row:hover {
		background: var(--surface-page);
	}

	.forecast-row.expandable {
		cursor: pointer;
	}

	.col-date {
		text-align: left;
		min-width: 180px;
		white-space: nowrap;
	}

	.col-data {
		text-align: center;
		min-width: 80px;
	}

	th.col-date {
		text-align: left;
	}

	.expand-icon {
		display: inline-block;
		width: 16px;
		font-size: var(--text-xs);
		color: var(--text-tertiary);
	}

	.pct-value {
		font-weight: 600;
	}

	.pct-green {
		color: var(--success);
	}

	.pct-orange {
		color: var(--amber-dark);
	}

	.pct-red {
		color: var(--danger);
	}

	.detail-row td {
		padding: var(--sp-2) var(--sp-4);
		background: var(--surface-page);
		border-bottom: 1px solid var(--border-default);
	}

	.detail-content {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.detail-person {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-size: var(--text-ui-sm);
	}

	.detail-name {
		color: var(--text-primary);
	}

	@media (max-width: 640px) {
		.date-row {
			flex-direction: column;
		}

		.date-row .form-group {
			min-width: unset;
		}

		th,
		td {
			padding: var(--sp-1) var(--sp-2);
			font-size: var(--text-ui-sm);
		}
	}
</style>
