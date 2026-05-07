<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { StatusType } from '$lib/types';
	import type { PersonnelTempoResult, TempoRow } from '../../utils/calendarReports';
	import { computePersonnelTempo } from '../../utils/calendarReports';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import * as DataTable from '$lib/components/ui/data-table';
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

	let { orgId, personnel, statusTypes }: Props = $props();

	// --- Period selector state ---
	type PeriodOption = '90' | '180' | '365' | 'custom';
	let periodOption = $state<PeriodOption>('90');

	function todayStr(): string {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	function daysAgo(n: number): string {
		const today = new Date();
		const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - n);
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
	const awayStatusTypeIds = new SvelteSet<string>();
	let previousStatusTypeIds: string[] = [];

	$effect(() => {
		const currentStatusTypeIds = statusTypes.map((s) => s.id);
		const currentStatusTypeIdSet = new SvelteSet(currentStatusTypeIds);

		untrack(() => {
			const selectedAllPrevious =
				previousStatusTypeIds.length > 0 && previousStatusTypeIds.every((id) => awayStatusTypeIds.has(id));
			const shouldSelectAll =
				(previousStatusTypeIds.length === 0 && awayStatusTypeIds.size === 0) || selectedAllPrevious;

			if (shouldSelectAll) {
				awayStatusTypeIds.clear();
				for (const id of currentStatusTypeIds) awayStatusTypeIds.add(id);
			} else {
				const selectedExistingIds = [...awayStatusTypeIds].filter((id) => currentStatusTypeIdSet.has(id));
				if (selectedExistingIds.length !== awayStatusTypeIds.size) {
					awayStatusTypeIds.clear();
					for (const id of selectedExistingIds) awayStatusTypeIds.add(id);
				}
			}

			previousStatusTypeIds = currentStatusTypeIds;
		});
	});

	function toggleAllStatuses() {
		if (awayStatusTypeIds.size === statusTypes.length) {
			awayStatusTypeIds.clear();
		} else {
			awayStatusTypeIds.clear();
			for (const statusType of statusTypes) awayStatusTypeIds.add(statusType.id);
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

	function toggleSet<T>(set: SvelteSet<T>, value: T): void {
		if (set.has(value)) set.delete(value);
		else set.add(value);
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

	const tableColumns = $derived.by<ColumnDef<TempoRow>[]>(() => [
		{
			key: 'rank',
			header: 'Rank',
			value: (r) => r.person.rank
		},
		{
			key: 'name',
			header: 'Name',
			value: (r) => `${r.person.lastName}, ${r.person.firstName}`,
			compare: (a, b) => a.person.lastName.localeCompare(b.person.lastName)
		},
		...displayColumns.map((statusType) => ({
			key: `status:${statusType.id}`,
			header: statusType.name,
			value: (r: TempoRow) => r.awayByStatus.get(statusType.id) ?? 0,
			searchable: false,
			sortable: false,
			align: 'center' as const
		})),
		{
			key: 'totalAway',
			header: 'Total Away',
			value: (r) => r.totalAwayDays,
			compare: (a, b) => a.totalAwayDays - b.totalAwayDays,
			align: 'center'
		},
		{
			key: 'percentAway',
			header: '% Away',
			value: (r) => r.percentAway,
			compare: (a, b) => a.percentAway - b.percentAway,
			align: 'center'
		}
	]);

	const table = useDataTable({
		data: () => result?.rows ?? [],
		columns: () => tableColumns,
		initialSortKey: 'name'
	});
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
					onclick={() => toggleSet(awayStatusTypeIds, st.id)}
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
			<DataTable.DataTable
				{table}
				columns={tableColumns}
				ariaLabel="Personnel tempo report"
				compact
				emptyMessage="No data found for the selected criteria."
			>
				{#snippet cell(row, column)}
					{#if column.key === 'rank'}
						{row.person.rank}
					{:else if column.key === 'name'}
						{row.person.lastName}, {row.person.firstName}
					{:else if column.key.startsWith('status:')}
						{Number(column.value(row)) > 0 ? column.value(row) : ''}
					{:else if column.key === 'totalAway'}
						{row.totalAwayDays > 0 ? row.totalAwayDays : ''}
					{:else if column.key === 'percentAway'}
						{row.percentAway > 0 ? `${row.percentAway}%` : ''}
					{:else}
						{String(column.value(row) ?? '')}
					{/if}
				{/snippet}
			</DataTable.DataTable>
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

	.threshold-group {
		max-width: 200px;
	}

	.threshold-input {
		width: 100px;
	}

	.status-filter-header {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin-bottom: var(--sp-2);
	}

	.personnel-count {
		font-size: var(--text-ui-sm);
		color: var(--text-tertiary);
	}

	.status-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
	}

	.status-chip {
		padding: var(--sp-1) var(--sp-2);
		border-radius: var(--radius-pill);
		font-size: var(--text-ui-sm);
		cursor: pointer;
		border: 2px solid var(--chip-color);
		background: transparent;
		color: var(--text-primary);
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

	@media (max-width: 640px) {
		.date-row {
			flex-direction: column;
		}

		.date-row .form-group {
			min-width: unset;
		}
	}
</style>
