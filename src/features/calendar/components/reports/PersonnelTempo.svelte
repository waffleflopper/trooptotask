<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { StatusType } from '$lib/types';
	import type { PersonnelTempoResult } from '../../utils/calendarReports';
	import { computePersonnelTempo } from '../../utils/calendarReports';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	interface Props {
		orgId: string;
		personnel: Personnel[];
		statusTypes: StatusType[];
		groups: { id: string; name: string }[];
	}

	let { orgId, personnel, statusTypes, groups }: Props = $props();

	// --- Period selector state ---
	type PeriodOption = '90' | '180' | '365' | 'custom';
	let periodOption = $state<PeriodOption>('90');

	function todayStr(): string {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	function daysAgo(n: number): string {
		const d = new Date();
		d.setDate(d.getDate() - n);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	let startDate = $state(daysAgo(90));
	let endDate = $state(todayStr());

	function handlePeriodChange(option: PeriodOption) {
		periodOption = option;
		if (option !== 'custom') {
			endDate = todayStr();
			startDate = daysAgo(Number(option));
		}
	}

	// --- "Away" status type selector ---
	let awayStatusTypeIds = $state<Set<string>>(new Set(statusTypes.map((s) => s.id)));

	function toggleAllStatuses() {
		if (awayStatusTypeIds.size === statusTypes.length) {
			awayStatusTypeIds = new Set();
		} else {
			awayStatusTypeIds = new Set(statusTypes.map((s) => s.id));
		}
	}

	// --- Threshold ---
	let threshold = $state(90);

	// --- Report execution ---
	let loading = $state(false);
	let result = $state<PersonnelTempoResult | null>(null);
	let errorMsg = $state('');

	async function runReport() {
		if (!startDate || !endDate) return;
		if (awayStatusTypeIds.size === 0) {
			errorMsg = 'Select at least one "away" status type.';
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
			// Filter entries to only away status types client-side
			const filteredEntries = data.entries.filter((e: Record<string, unknown>) =>
				awayStatusTypeIds.has(e.statusTypeId as string)
			);
			result = computePersonnelTempo(personnel, filteredEntries, awayStatusTypeIds, startDate, endDate, threshold);
		} catch (e: unknown) {
			errorMsg = e instanceof Error ? e.message : 'Failed to generate report.';
		} finally {
			loading = false;
		}
	}

	function toggleSet<T>(set: Set<T>, value: T): Set<T> {
		const next = new Set(set);
		if (next.has(value)) next.delete(value);
		else next.add(value);
		return next;
	}

	const statusTypeMap = $derived(new Map(statusTypes.map((s) => [s.id, s])));

	const displayColumns = $derived(
		result ? result.activeStatusTypeIds.map((id) => statusTypeMap.get(id)).filter((s): s is StatusType => !!s) : []
	);

	// --- CSV Export ---
	function handleExportCsv() {
		if (!result) return;

		const headers = ['Rank', 'Last Name', 'First Name', ...displayColumns.map((s) => s.name), 'Total Away', '% Away'];
		const csvRows = [headers.join(',')];

		for (const row of result.rows) {
			const cells = [
				escapeCsv(row.person.rank),
				escapeCsv(row.person.lastName),
				escapeCsv(row.person.firstName),
				...displayColumns.map((st) => String(row.awayByStatus.get(st.id) ?? 0)),
				String(row.totalAwayDays),
				String(row.percentAway)
			];
			csvRows.push(cells.join(','));
		}

		const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `personnel-tempo_${startDate}_${endDate}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function escapeCsv(value: string): string {
		if (value.includes(',') || value.includes('"') || value.includes('\n')) {
			return `"${value.replace(/"/g, '""')}"`;
		}
		return value;
	}
</script>

<div class="report-config">
	<div class="config-section">
		<h3>Period</h3>
		<div class="date-row">
			<label class="form-group">
				<span class="label">Range</span>
				<select
					class="select"
					value={periodOption}
					onchange={(e) => handlePeriodChange(e.currentTarget.value as PeriodOption)}
				>
					<option value="90">Past 90 Days</option>
					<option value="180">Past 180 Days</option>
					<option value="365">Past 365 Days</option>
					<option value="custom">Custom</option>
				</select>
			</label>
			{#if periodOption === 'custom'}
				<label class="form-group">
					<span class="label">Start</span>
					<input type="date" class="input" bind:value={startDate} />
				</label>
				<label class="form-group">
					<span class="label">End</span>
					<input type="date" class="input" bind:value={endDate} />
				</label>
			{/if}
		</div>
	</div>

	<div class="config-section">
		<h3>"Away" Status Types</h3>
		<div class="status-filter-header">
			<button class="btn btn-sm btn-secondary" onclick={toggleAllStatuses}>
				{awayStatusTypeIds.size === statusTypes.length ? 'Deselect All' : 'Select All'}
			</button>
			<span class="personnel-count">
				{awayStatusTypeIds.size} of {statusTypes.length} selected
			</span>
		</div>
		<div class="status-chips">
			{#each statusTypes as st (st.id)}
				<button
					class="status-chip"
					class:selected={awayStatusTypeIds.has(st.id)}
					style:--chip-color={st.color}
					style:--chip-text={st.textColor}
					onclick={() => (awayStatusTypeIds = toggleSet(awayStatusTypeIds, st.id))}
				>
					{st.name}
				</button>
			{/each}
		</div>
	</div>

	<div class="config-section">
		<h3>Flag Threshold</h3>
		<label class="form-group threshold-group">
			<span class="label">Flag threshold (days)</span>
			<input type="number" class="input threshold-input" bind:value={threshold} min={1} />
		</label>
	</div>

	<div class="config-actions">
		<button
			class="btn btn-primary"
			onclick={runReport}
			disabled={loading || !startDate || !endDate || awayStatusTypeIds.size === 0}
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
				{result.rows.length} personnel &middot; {startDate} to {endDate} &middot; {result.totalDaysInPeriod} days in period
			</span>
			<button class="btn btn-secondary btn-sm" onclick={handleExportCsv}> Export CSV </button>
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
							<th class="col-total">Total Away</th>
							<th class="col-percent">% Away</th>
						</tr>
					</thead>
					<tbody>
						{#each result.rows as row (row.person.id)}
							<tr class:flagged={row.flagged}>
								<td class="col-rank">{row.person.rank}</td>
								<td class="col-name">{row.person.lastName}, {row.person.firstName}</td>
								{#each displayColumns as st (st.id)}
									<td class="col-status">
										{(row.awayByStatus.get(st.id) ?? 0) > 0 ? row.awayByStatus.get(st.id) : ''}
									</td>
								{/each}
								<td class="col-total">{row.totalAwayDays > 0 ? row.totalAwayDays : ''}</td>
								<td class="col-percent">{row.percentAway > 0 ? `${row.percentAway}%` : ''}</td>
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

	.threshold-group {
		max-width: 200px;
	}

	.threshold-input {
		width: 100px;
	}

	.status-filter-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-sm);
	}

	.personnel-count {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
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

	.report-table tbody tr.flagged {
		background: color-mix(in srgb, var(--color-error) 8%, transparent);
	}

	.report-table tbody tr.flagged:nth-child(even) {
		background: color-mix(in srgb, var(--color-error) 12%, transparent);
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

	.col-status {
		text-align: center;
		min-width: 80px;
	}

	.col-total {
		text-align: center;
		font-weight: 600;
		min-width: 80px;
	}

	.col-percent {
		text-align: center;
		font-weight: 600;
		min-width: 70px;
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
