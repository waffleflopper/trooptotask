# Calendar Reports Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a calendar reports page with a "Status Days Summary" report that shows how many days each person spent in each status over a date range.

**Architecture:** New SvelteKit sub-route under `/calendar/reports` with a dedicated API endpoint for querying availability entries by date range. Report logic (day counting) lives in a pure utility function. The report page is a thin shell that imports feature components from `src/features/calendar/components/reports/`.

**Tech Stack:** SvelteKit 2.5, Svelte 5 runes, TypeScript, Supabase query, CSV export via Blob download.

**Spec:** `docs/superpowers/specs/2026-03-12-calendar-reports-design.md`

---

## Task 1: Day Counting Utility

**Files:**

- Create: `src/features/calendar/utils/statusDaysReport.ts`

This is the core business logic — pure functions, no framework dependencies.

- [ ] **Step 1.1: Create the utility file**

```typescript
// src/features/calendar/utils/statusDaysReport.ts
import type { AvailabilityEntry, StatusType } from '../calendar.types';
import type { Personnel } from '$lib/types';
import { RANK_ORDER } from '$features/personnel/utils/personnelGrouping';

export interface StatusDayRow {
	person: Personnel;
	statusDays: Map<string, number>; // statusTypeId → day count
	totalDays: number; // unique calendar days with any status
}

export interface StatusDaysResult {
	rows: StatusDayRow[];
	activeStatusTypeIds: string[]; // status type IDs that appear in results (for column headers)
}

/**
 * Expand a date range string pair into individual YYYY-MM-DD date strings,
 * clamped to the report's start/end bounds.
 */
function expandDateRange(entryStart: string, entryEnd: string, reportStart: string, reportEnd: string): string[] {
	const start = clampDate(entryStart, reportStart, reportEnd);
	const end = clampDate(entryEnd, reportStart, reportEnd);
	const dates: string[] = [];
	const current = new Date(start + 'T00:00:00');
	const endDate = new Date(end + 'T00:00:00');
	while (current <= endDate) {
		dates.push(
			`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
		);
		current.setDate(current.getDate() + 1);
	}
	return dates;
}

function clampDate(date: string, min: string, max: string): string {
	if (date < min) return min;
	if (date > max) return max;
	return date;
}

/**
 * Compute status day counts for each person.
 */
export function computeStatusDays(
	personnel: Personnel[],
	entries: AvailabilityEntry[],
	startDate: string,
	endDate: string
): StatusDaysResult {
	// Index entries by personnelId for fast lookup
	const entriesByPerson = new Map<string, AvailabilityEntry[]>();
	for (const entry of entries) {
		let list = entriesByPerson.get(entry.personnelId);
		if (!list) {
			list = [];
			entriesByPerson.set(entry.personnelId, list);
		}
		list.push(entry);
	}

	const activeStatusTypeIds = new Set<string>();
	const rows: StatusDayRow[] = [];

	for (const person of personnel) {
		const personEntries = entriesByPerson.get(person.id) ?? [];
		const statusDays = new Map<string, number>();
		const allDatesWithStatus = new Set<string>();

		for (const entry of personEntries) {
			const dates = expandDateRange(entry.startDate, entry.endDate, startDate, endDate);
			for (const dateStr of dates) {
				allDatesWithStatus.add(dateStr);
				statusDays.set(entry.statusTypeId, (statusDays.get(entry.statusTypeId) ?? 0) + 1);
				activeStatusTypeIds.add(entry.statusTypeId);
			}
		}

		rows.push({
			person,
			statusDays,
			totalDays: allDatesWithStatus.size
		});
	}

	// Sort rows by rank then last name
	const rankIndex = new Map(RANK_ORDER.map((r, i) => [r, i]));
	rows.sort((a, b) => {
		const ra = rankIndex.get(a.person.rank) ?? 999;
		const rb = rankIndex.get(b.person.rank) ?? 999;
		if (ra !== rb) return ra - rb;
		return a.person.lastName.localeCompare(b.person.lastName) || a.person.firstName.localeCompare(b.person.firstName);
	});

	return {
		rows,
		activeStatusTypeIds: [...activeStatusTypeIds]
	};
}
```

- [ ] **Step 1.2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | grep statusDaysReport || echo "No errors"`

- [ ] **Step 1.3: Commit**

```bash
git add src/features/calendar/utils/statusDaysReport.ts
git commit -m "feat(calendar-reports): add status days computation utility"
```

---

## Task 2: CSV Export Utility

**Files:**

- Create: `src/features/calendar/components/reports/StatusDaysSummaryExport.ts`

- [ ] **Step 2.1: Create the export file**

```typescript
// src/features/calendar/components/reports/StatusDaysSummaryExport.ts
import type { StatusDaysResult } from '../../utils/statusDaysReport';
import type { StatusType } from '../../calendar.types';

function escapeCsvCell(value: string): string {
	if (value.includes(',') || value.includes('"') || value.includes('\n')) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

export function exportStatusDaysCsv(
	result: StatusDaysResult,
	statusTypes: StatusType[],
	startDate: string,
	endDate: string
): void {
	const statusTypeMap = new Map(statusTypes.map((s) => [s.id, s]));
	const columns = result.activeStatusTypeIds.map((id) => statusTypeMap.get(id)).filter((s): s is StatusType => !!s);

	// Header row
	const headers = ['Rank', 'Last Name', 'First Name', ...columns.map((s) => s.name), 'Total Days'];
	const rows = [headers.map(escapeCsvCell).join(',')];

	// Data rows
	for (const row of result.rows) {
		const cells = [
			row.person.rank,
			row.person.lastName,
			row.person.firstName,
			...columns.map((s) => {
				const count = row.statusDays.get(s.id) ?? 0;
				return count > 0 ? String(count) : '';
			}),
			row.totalDays > 0 ? String(row.totalDays) : ''
		];
		rows.push(cells.map(escapeCsvCell).join(','));
	}

	const csv = rows.join('\n');
	const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = `status-days-${startDate}-to-${endDate}.csv`;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}
```

- [ ] **Step 2.2: Commit**

```bash
git add src/features/calendar/components/reports/StatusDaysSummaryExport.ts
git commit -m "feat(calendar-reports): add CSV export for status days report"
```

---

## Task 3: API Endpoint

**Files:**

- Create: `src/routes/org/[orgId]/api/calendar-reports/status-days/+server.ts`

- [ ] **Step 3.1: Create the API endpoint**

```typescript
// src/routes/org/[orgId]/api/calendar-reports/status-days/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isPrivilegedRole } from '$lib/server/permissions';
import { transformAvailabilityEntries } from '$lib/server/transforms';

export const GET: RequestHandler = async ({ params, url, locals }) => {
	const supabase = locals.supabase;
	const user = locals.user;
	if (!user) throw error(401, 'Not authenticated');

	const orgId = params.orgId;

	// Permission check: owner or admin only
	const { data: membership } = await supabase
		.from('organization_memberships')
		.select('role')
		.eq('organization_id', orgId)
		.eq('user_id', user.id)
		.single();

	if (!membership || !isPrivilegedRole(membership.role)) {
		throw error(403, 'Only owners and admins can access reports');
	}

	// Validate query params
	const startDate = url.searchParams.get('startDate');
	const endDate = url.searchParams.get('endDate');

	if (!startDate || !endDate) {
		throw error(400, 'startDate and endDate query params are required');
	}

	if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
		throw error(400, 'Dates must be in YYYY-MM-DD format');
	}

	if (startDate > endDate) {
		throw error(400, 'startDate must be before or equal to endDate');
	}

	// Query availability entries for the date range
	const { data, error: dbError } = await supabase
		.from('availability_entries')
		.select('*')
		.eq('organization_id', orgId)
		.gte('end_date', startDate)
		.lte('start_date', endDate);

	if (dbError) {
		throw error(500, 'Failed to fetch availability data');
	}

	return json({ entries: transformAvailabilityEntries(data ?? []) });
};
```

- [ ] **Step 3.2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | grep "calendar-reports" || echo "No errors"`

- [ ] **Step 3.3: Commit**

```bash
git add 'src/routes/org/[orgId]/api/calendar-reports/status-days/+server.ts'
git commit -m "feat(calendar-reports): add status-days API endpoint"
```

---

## Task 4: StatusDaysSummary Component

**Files:**

- Create: `src/features/calendar/components/reports/StatusDaysSummary.svelte`

This is the main report component with the config panel and output table.

- [ ] **Step 4.1: Create the component**

The component handles:

1. Date range selection with year shortcut
2. Personnel filtering (all, by name, by group, by MOS, by role)
3. Fetching data from the API
4. Computing results via `computeStatusDays`
5. Rendering the output table
6. CSV export

```svelte
<!-- src/features/calendar/components/reports/StatusDaysSummary.svelte -->
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
		// Clear year shortcut if user manually edits dates
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

	// Derive unique MOS codes and roles from personnel
	const uniqueMosCodes = $derived([...new Set(personnel.map((p) => p.mos).filter(Boolean))].sort());
	const uniqueRoles = $derived([...new Set(personnel.map((p) => p.clinicRole).filter(Boolean))].sort());

	// Filter personnel based on current filter mode
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

	// Name search filtered list (for the name picker)
	const nameFilteredPersonnel = $derived(
		nameSearch
			? personnel.filter((p) =>
					`${p.rank} ${p.lastName} ${p.firstName}`.toLowerCase().includes(nameSearch.toLowerCase())
				)
			: personnel
	);

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
			result = computeStatusDays(filteredPersonnel, data.entries, startDate, endDate);
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

	// --- Helpers ---
	function toggleSet<T>(set: Set<T>, value: T): Set<T> {
		const next = new Set(set);
		if (next.has(value)) next.delete(value);
		else next.add(value);
		return next;
	}

	// Status type map for rendering
	const statusTypeMap = $derived(new Map(statusTypes.map((s) => [s.id, s])));

	// Columns to display (only status types that appear in results)
	const displayColumns = $derived(
		result ? result.activeStatusTypeIds.map((id) => statusTypeMap.get(id)).filter((s): s is StatusType => !!s) : []
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
				<input type="date" class="input" bind:value={startDate} oninput={handleDateChange} />
			</label>
			<label class="form-group">
				<span class="label">End</span>
				<input type="date" class="input" bind:value={endDate} oninput={handleDateChange} />
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
				<input type="text" class="input" placeholder="Search by name..." bind:value={nameSearch} />
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
				{result.rows.length} personnel &middot; {startDate} to {endDate}
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
										{@const count = row.statusDays.get(st.id) ?? 0}
										{count > 0 ? count : '—'}
									</td>
								{/each}
								<td class="col-total">{row.totalDays > 0 ? row.totalDays : '—'}</td>
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

	/* Mobile */
	@media (max-width: 640px) {
		.date-row {
			flex-direction: column;
		}

		.date-row .form-group {
			min-width: unset;
		}
	}
</style>
```

- [ ] **Step 4.2: Commit**

```bash
git add src/features/calendar/components/reports/StatusDaysSummary.svelte
git commit -m "feat(calendar-reports): add StatusDaysSummary component"
```

---

## Task 5: CalendarReports Shell Component

**Files:**

- Create: `src/features/calendar/components/reports/CalendarReports.svelte`

A thin wrapper that holds the report type selector and renders the selected report.

- [ ] **Step 5.1: Create the component**

```svelte
<!-- src/features/calendar/components/reports/CalendarReports.svelte -->
<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { StatusType } from '../../calendar.types';
	import StatusDaysSummary from './StatusDaysSummary.svelte';

	interface Props {
		orgId: string;
		personnel: Personnel[];
		statusTypes: StatusType[];
		groups: { id: string; name: string }[];
	}

	let { orgId, personnel, statusTypes, groups }: Props = $props();

	type ReportType = 'status-days';
	let selectedReport = $state<ReportType>('status-days');

	const reportOptions: { value: ReportType; label: string }[] = [
		{ value: 'status-days', label: 'Status Days Summary' }
	];
</script>

<div class="reports-page">
	<div class="report-selector">
		<label class="form-group">
			<span class="label">Report Type</span>
			<select class="select" bind:value={selectedReport}>
				{#each reportOptions as opt (opt.value)}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		</label>
	</div>

	{#if selectedReport === 'status-days'}
		<StatusDaysSummary {orgId} {personnel} {statusTypes} {groups} />
	{/if}
</div>

<style>
	.reports-page {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.report-selector {
		max-width: 300px;
	}
</style>
```

- [ ] **Step 5.2: Commit**

```bash
git add src/features/calendar/components/reports/CalendarReports.svelte
git commit -m "feat(calendar-reports): add CalendarReports shell component"
```

---

## Task 6: Route Files

**Files:**

- Create: `src/routes/org/[orgId]/calendar/reports/+page.server.ts`
- Create: `src/routes/org/[orgId]/calendar/reports/+page.svelte`

- [ ] **Step 6.1: Create the page server (permission gate)**

```typescript
// src/routes/org/[orgId]/calendar/reports/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const data = await parent();

	// Only owners and admins can access reports
	if (!data.isOwner && !data.isAdmin) {
		throw redirect(302, `/org/${data.orgId}/calendar`);
	}

	return {};
};
```

- [ ] **Step 6.2: Create the page component**

```svelte
<!-- src/routes/org/[orgId]/calendar/reports/+page.svelte -->
<script lang="ts">
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import CalendarReports from '$features/calendar/components/reports/CalendarReports.svelte';

	let { data } = $props();
</script>

<PageToolbar title="Calendar Reports" />

<CalendarReports orgId={data.orgId} personnel={data.allPersonnel} statusTypes={data.statusTypes} groups={data.groups} />
```

- [ ] **Step 6.3: Commit**

```bash
git add 'src/routes/org/[orgId]/calendar/reports/+page.server.ts' 'src/routes/org/[orgId]/calendar/reports/+page.svelte'
git commit -m "feat(calendar-reports): add reports route with permission gate"
```

---

## Task 7: Add Reports Link to Calendar Toolbar

**Files:**

- Modify: `src/routes/org/[orgId]/calendar/+page.svelte`

Add a "Reports" item to the calendar page overflow menu, visible only to owner/admin.

- [ ] **Step 7.1: Add the overflow item**

Find the `calendarOverflowItems` derived block in `calendar/+page.svelte`. Add a "Reports" item that uses `href` to navigate to the reports page. Place it before the "Configure" group items (before the last divider). The item should only appear for owners and admins (not just `canManageConfig` which includes full-editors).

The item should look like:

```typescript
{
	label: 'Status Reports',
	href: `/org/${data.orgId}/calendar/reports`,
}
```

Add it gated behind `data.isOwner || data.isAdmin`.

- [ ] **Step 7.2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 7.3: Commit**

```bash
git add 'src/routes/org/[orgId]/calendar/+page.svelte'
git commit -m "feat(calendar-reports): add Reports link to calendar toolbar"
```

---

## Task 8: Final Verification

- [ ] **Step 8.1: Full build check**

Run: `npm run build`
Expected: Build succeeds with no new errors.

- [ ] **Step 8.2: Manual smoke test checklist**

1. Navigate to calendar page as owner/admin — "Status Reports" appears in overflow menu
2. Navigate to calendar page as regular member — "Status Reports" does NOT appear
3. Click "Status Reports" — navigates to `/org/[orgId]/calendar/reports`
4. Select a year — start/end dates auto-fill
5. Manually adjust dates — year dropdown shows "Custom"
6. Filter by group — personnel count updates
7. Filter by name — search works, checkboxes work
8. Click "Generate Report" — table renders with status columns and day counts
9. Click "Export CSV" — CSV file downloads
10. Navigate directly to `/org/[orgId]/calendar/reports` as non-admin — redirects to calendar

- [ ] **Step 8.3: Final commit (if any fixes needed)**
