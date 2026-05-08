<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { StatusType } from '$lib/types';
	import type { AvailabilityForecastResult, ForecastDay } from '../../utils/calendarReports';
	import { computeAvailabilityForecast } from '../../utils/calendarReports';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as DataTable from '$lib/components/ui/data-table';
	import { useDataTable } from '$lib/components/ui/data-table';
	import type { ColumnDef } from '$lib/components/ui/data-table';
	import { SvelteSet } from 'svelte/reactivity';

	interface Props {
		orgId: string;
		personnel: Personnel[];
		statusTypes: StatusType[];
		groups: { id: string; name: string }[];
	}

	let { orgId, personnel, statusTypes, groups }: Props = $props();

	// --- Date range state ---
	const today = new Date();
	const thirtyDaysFromNow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);

	function formatDate(d: Date): string {
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	let startDate = $state(formatDate(today));
	let endDate = $state(formatDate(thirtyDaysFromNow));

	// --- Group filter state ---
	const selectedGroupIds = new SvelteSet<string>();

	const filteredPersonnel = $derived.by(() => {
		if (selectedGroupIds.size === 0) return personnel;
		return personnel.filter((p) => p.groupId && selectedGroupIds.has(p.groupId));
	});

	// --- Report execution ---
	let loading = $state(false);
	let result = $state<AvailabilityForecastResult | null>(null);
	let errorMsg = $state('');

	// --- Expandable rows ---
	const expandedDates = new SvelteSet<string>();

	function toggleExpanded(date: string) {
		if (expandedDates.has(date)) expandedDates.delete(date);
		else expandedDates.add(date);
	}

	function toggleForecastRow(day: ForecastDay): void {
		if (day.unavailableCount > 0) toggleExpanded(day.date);
	}

	function toggleGroup(groupId: string) {
		if (selectedGroupIds.has(groupId)) selectedGroupIds.delete(groupId);
		else selectedGroupIds.add(groupId);
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
		expandedDates.clear();

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
			compare: (a, b) => a.unavailableCount - b.unavailableCount,
			align: 'center'
		},
		{
			key: 'available',
			header: 'Available',
			value: (r) => r.availableCount,
			compare: (a, b) => a.availableCount - b.availableCount,
			align: 'center'
		},
		{
			key: 'percent',
			header: 'Available %',
			value: (r) => r.availablePercent,
			compare: (a, b) => a.availablePercent - b.availablePercent,
			align: 'center'
		}
	];

	const table = useDataTable({
		data: () => result?.days ?? [],
		columns: tableColumns,
		initialSortKey: 'date'
	});
</script>

<div class="bg-card flex flex-col gap-4 rounded-lg border p-4">
	<div>
		<h3 class="text-muted-foreground mb-2 text-sm font-semibold tracking-wide uppercase">Date Range</h3>
		<div class="flex flex-wrap items-end gap-2">
			<label class="grid min-w-[120px] flex-1 gap-1">
				<span class="text-sm font-medium">Start</span>
				<Input type="date" bind:value={startDate} />
			</label>
			<label class="grid min-w-[120px] flex-1 gap-1">
				<span class="text-sm font-medium">End</span>
				<Input type="date" bind:value={endDate} />
			</label>
		</div>
	</div>

	<div>
		<h3 class="text-muted-foreground mb-2 text-sm font-semibold tracking-wide uppercase">Group Filter</h3>
		<div class="flex max-h-[200px] flex-col gap-0.5 overflow-y-auto rounded-md border p-1">
			{#each groups as group (group.id)}
				<label class="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm">
					<input type="checkbox" checked={selectedGroupIds.has(group.id)} onchange={() => toggleGroup(group.id)} />
					<span>{group.name}</span>
				</label>
			{/each}
		</div>
		<div class="text-muted-foreground mt-1 text-sm">
			{filteredPersonnel.length} of {personnel.length} personnel selected
			{#if selectedGroupIds.size === 0}
				(all)
			{/if}
		</div>
	</div>

	<div class="flex justify-end">
		<Button onclick={runReport} disabled={loading || !startDate || !endDate}>
			{#if loading}<Spinner />{/if}
			{loading ? 'Generating...' : 'Generate Report'}
		</Button>
	</div>
</div>

{#if errorMsg}
	<div class="text-destructive bg-destructive/10 mt-2 rounded-md border px-3 py-2 text-sm">{errorMsg}</div>
{/if}

{#if result}
	<div class="mt-4">
		<div class="mb-2 flex items-center justify-between gap-2">
			<span class="text-muted-foreground text-sm">
				{result.days.length} days &middot; {filteredPersonnel.length} personnel &middot; {startDate} to {endDate}
			</span>
			<Button variant="outline" size="sm" onclick={handleExportCsv}>Export CSV</Button>
		</div>

		{#if result.days.length === 0}
			<p class="text-muted-foreground py-8 text-center text-sm italic">No data found for the selected criteria.</p>
		{:else}
			<DataTable.DataTable
				{table}
				columns={tableColumns}
				ariaLabel="Availability forecast"
				compact
				striped
				emptyMessage="No data found for the selected criteria."
				onRowClick={toggleForecastRow}
				rowActionLabel={(day) =>
					day.unavailableCount > 0
						? `${expandedDates.has(day.date) ? 'Collapse' : 'Expand'} unavailable personnel for ${formatDisplayDate(day.date)}`
						: `Availability for ${formatDisplayDate(day.date)}`}
				rowDetailVisible={(day) => expandedDates.has(day.date)}
			>
				{#snippet cell(day, column)}
					{#if column.key === 'date'}
						{#if day.unavailableCount > 0}
							{expandedDates.has(day.date) ? 'Collapse' : 'Expand'} {formatDisplayDate(day.date)}
						{:else}
							{formatDisplayDate(day.date)}
						{/if}
					{:else if column.key === 'percent'}
						{day.availablePercent}%
					{:else}
						{String(column.value(day) ?? '')}
					{/if}
				{/snippet}

				{#snippet rowDetail(day)}
					<ul>
						{#each day.unavailablePersonnel as entry (entry.person.id)}
							<li>
								{entry.person.rank}
								{entry.person.lastName}, {entry.person.firstName}
								<Badge variant="outline">{entry.statusName}</Badge>
							</li>
						{/each}
					</ul>
				{/snippet}
			</DataTable.DataTable>
		{/if}
	</div>
{/if}
