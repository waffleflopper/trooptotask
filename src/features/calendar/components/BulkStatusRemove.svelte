<script lang="ts">
	import type { Personnel, StatusType, AvailabilityEntry } from '$lib/types';
	import { formatDate } from '$lib/utils/dates';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { CalendarStatusBadge } from '$lib/components/ui/calendar-status-badge';
	import { Badge as UiBadge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as DataTable from '$lib/components/ui/data-table';
	import { useDataTable, type ColumnDef } from '$lib/components/ui/data-table';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';

	interface GroupData {
		group: string;
		personnel: Personnel[];
	}

	interface MatchResult {
		exact: AvailabilityEntry[];
		partial: AvailabilityEntry[];
	}

	interface Props {
		personnelByGroup: GroupData[];
		statusTypes: StatusType[];
		availabilityEntries: AvailabilityEntry[];
		personnelList: Personnel[];
		onRemove: (ids: string[]) => Promise<boolean>;
		onComplete: () => void;
	}

	let { personnelByGroup, statusTypes, availabilityEntries, personnelList, onRemove, onComplete }: Props = $props();

	const todayStr = formatDate(new Date());

	// Selection state
	let selectedStatusId = $state('');
	let startDate = $state(todayStr);
	let endDate = $state(todayStr);
	const selectedIds = new SvelteSet<string>();

	// Step state
	let step = $state<'select' | 'confirm'>('select');
	let matchResult = $state<MatchResult>({ exact: [], partial: [] });
	let isSubmitting = $state(false);

	const allPersonnel = $derived(personnelByGroup.flatMap((g) => g.personnel));

	// ---- DataTable setup ----
	const columns: ColumnDef<Personnel>[] = [
		{ key: 'select', header: '', value: () => '', searchable: false },
		{ key: 'rank', header: 'Rank', value: (p) => p.rank },
		{
			key: 'name',
			header: 'Name',
			value: (p) => `${p.lastName}, ${p.firstName}`,
			searchValue: (p) => `${p.lastName} ${p.firstName}`
		},
		{ key: 'mos', header: 'MOS / Duty Role', value: (p) => p.mos || p.clinicRole }
	];

	const table = useDataTable<Personnel>({
		data: () => allPersonnel,
		columns,
		groupBy: {
			key: (p) => p.groupName || 'Unassigned'
		},
		filterFn: (p, query) => {
			const q = query.toLowerCase();
			return (
				p.lastName.toLowerCase().includes(q) ||
				p.firstName.toLowerCase().includes(q) ||
				p.rank.toLowerCase().includes(q) ||
				p.mos.toLowerCase().includes(q) ||
				p.clinicRole.toLowerCase().includes(q)
			);
		}
	});

	// ---- Selection logic ----
	function togglePerson(id: string) {
		if (selectedIds.has(id)) selectedIds.delete(id);
		else selectedIds.add(id);
	}

	function getVisiblePersonnelIds(): string[] {
		const groupedIds = table.groups.flatMap((g) => g.rows.map((p) => p.id));
		return groupedIds.length > 0 ? groupedIds : table.rows.map((p) => p.id);
	}

	function selectVisible() {
		for (const id of getVisiblePersonnelIds()) selectedIds.add(id);
	}

	function selectNone() {
		selectedIds.clear();
	}

	function getGroupSelectionState(groupKey: string): 'none' | 'some' | 'all' {
		const group = table.groups.find((g) => g.key === groupKey);
		if (!group || group.rows.length === 0) return 'none';
		const count = group.rows.filter((p) => selectedIds.has(p.id)).length;
		if (count === 0) return 'none';
		if (count === group.rows.length) return 'all';
		return 'some';
	}

	function toggleGroup(groupKey: string) {
		const group = table.groups.find((g) => g.key === groupKey);
		if (!group) return;
		const state = getGroupSelectionState(groupKey);
		if (state === 'all') {
			for (const p of group.rows) selectedIds.delete(p.id);
		} else {
			for (const p of group.rows) selectedIds.add(p.id);
		}
	}

	// ---- Validation ----
	const dateError = $derived.by(() => {
		if (startDate && endDate && startDate > endDate) return 'End date must be on or after start date';
		return null;
	});

	const dayCount = $derived.by(() => {
		if (!startDate || !endDate || startDate > endDate) return 0;
		const start = new Date(startDate + 'T00:00:00');
		const end = new Date(endDate + 'T00:00:00');
		return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
	});

	const isValid = $derived(selectedStatusId && startDate && endDate && startDate <= endDate && selectedIds.size > 0);
	const selectedStatus = $derived(statusTypes.find((s) => s.id === selectedStatusId));
	const personnelMap = $derived(new SvelteMap(personnelList.map((p) => [p.id, p])));

	$effect(() => {
		if (!selectedStatusId && statusTypes.length > 0) {
			selectedStatusId = statusTypes[0].id;
		}
	});

	function formatDateDisplay(dateStr: string): string {
		const date = new Date(dateStr + 'T00:00:00');
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	// ---- Two-step flow ----
	function handleFindMatching() {
		if (!isValid) return;

		const matching = availabilityEntries.filter(
			(e) =>
				selectedIds.has(e.personnelId) &&
				e.statusTypeId === selectedStatusId &&
				e.startDate <= endDate &&
				e.endDate >= startDate
		);

		const exact: AvailabilityEntry[] = [];
		const partial: AvailabilityEntry[] = [];

		for (const entry of matching) {
			if (entry.startDate >= startDate && entry.endDate <= endDate) {
				exact.push(entry);
			} else {
				partial.push(entry);
			}
		}

		matchResult = { exact, partial };
		step = 'confirm';
	}

	function handleBack() {
		step = 'select';
		matchResult = { exact: [], partial: [] };
	}

	async function handleConfirmRemoval() {
		if (isSubmitting) return;
		const allIds = [...matchResult.exact.map((e) => e.id), ...matchResult.partial.map((e) => e.id)];
		if (allIds.length === 0) return;

		isSubmitting = true;
		try {
			const success = await onRemove(allIds);
			if (success) {
				const count = allIds.length;
				toastStore.success(`Removed ${count} status ${count === 1 ? 'entry' : 'entries'}`);
				onComplete();
			} else {
				toastStore.error('Failed to remove status entries');
			}
		} finally {
			isSubmitting = false;
		}
	}

	function getPersonName(personnelId: string): string {
		const p = personnelMap.get(personnelId);
		return p ? `${p.rank} ${p.lastName}, ${p.firstName}` : 'Unknown';
	}
</script>

<div class="bulk-remove-panel">
	{#if step === 'select'}
		<div class="bulk-workspace">
			<aside class="controls-column">
				<section class="controls-card">
					<div class="pane-heading">
						<span class="pane-eyebrow">Step 1</span>
						<h2 class="pane-title">Define what to remove</h2>
						<p class="pane-copy">
							Pick the status, date range, and people first. We will show you every matching entry before anything is
							deleted.
						</p>
					</div>

					<div class="config-grid">
						<Field.Root>
							<Field.Label for="removeStatusType">Status Type</Field.Label>
							<NativeSelect id="removeStatusType" bind:value={selectedStatusId}>
								{#each statusTypes as status (status.id)}
									<option value={status.id}>{status.name}</option>
								{/each}
							</NativeSelect>
							{#if selectedStatus}
								<div class="status-summary-support">
									<CalendarStatusBadge statusType={selectedStatus}>{selectedStatus.name}</CalendarStatusBadge>
									<span class="status-summary-hint">Selected status</span>
								</div>
							{/if}
						</Field.Root>

						<div class="date-grid">
							<Field.Root>
								<Field.Label for="removeStartDate">Start Date</Field.Label>
								<DatePicker id="removeStartDate" bind:value={startDate} placeholder="Select start date" />
							</Field.Root>

							<Field.Root>
								<Field.Label for="removeEndDate">End Date</Field.Label>
								<DatePicker id="removeEndDate" bind:value={endDate} placeholder="Select end date" />
								{#if dayCount > 0}
									<div class="status-summary-support">
										<span class="day-count-number">{dayCount}</span>
										<span class="status-summary-hint">{dayCount === 1 ? 'day selected' : 'days selected'}</span>
									</div>
								{/if}
							</Field.Root>
						</div>

						{#if dateError}
							<div class="date-error" role="alert">{dateError}</div>
						{/if}
					</div>

					<div class="summary-card warning-summary" aria-live="polite">
						<h3 class="summary-heading">Removal summary</h3>
						{#if selectedIds.size > 0 && selectedStatus && !dateError}
							<div class="summary-line">
								<CalendarStatusBadge statusType={selectedStatus}>{selectedStatus.name}</CalendarStatusBadge>
								<span class="summary-copy">
									<strong>{selectedIds.size}</strong>
									{selectedIds.size === 1 ? 'person' : 'people'}
									selected
								</span>
							</div>
							<p class="summary-copy">
								{#if startDate === endDate}
									{formatDateDisplay(startDate)}
								{:else}
									{formatDateDisplay(startDate)} to {formatDateDisplay(endDate)}
								{/if}
							</p>
							<p class="summary-copy muted">
								Overlapping entries are removed in full, so the review step is especially important.
							</p>
						{:else if selectedIds.size === 0}
							<p class="summary-copy muted">Choose at least one person from the list to review possible removals.</p>
						{:else if dateError}
							<p class="summary-copy error">{dateError}</p>
						{/if}
					</div>

					<Button variant="destructive" class="apply-button" disabled={!isValid} onclick={handleFindMatching}>
						Review Matching Entries
					</Button>
				</section>
			</aside>

			<section class="selection-column">
				<div class="selection-card">
					<div class="pane-heading selection-heading">
						<span class="pane-eyebrow">Step 2</span>
						<h2 class="pane-title">Choose personnel</h2>
						<p class="pane-copy">Search by name, select an entire group, or click individual rows.</p>
					</div>

					<div class="personnel-section">
						<DataTable.DataTable
							{columns}
							{table}
							compact
							showSearch
							searchPlaceholder="Search by name, rank, MOS, or role..."
							emptyMessage="No personnel available"
							onRowClick={(person) => togglePerson(person.id)}
						>
							{#snippet toolbar()}
								<DataTable.BulkActions selectedCount={selectedIds.size} totalCount={table.totalRows}>
									<Button type="button" variant="outline" size="sm" onclick={selectVisible}>Select shown</Button>
									<Button type="button" variant="outline" size="sm" onclick={selectNone}>Clear</Button>
								</DataTable.BulkActions>
							{/snippet}

							{#snippet groupHeader(ctx)}
								{@const selState = getGroupSelectionState(ctx.key)}
								<DataTable.SelectionCheckbox
									checked={selState === 'all'}
									indeterminate={selState === 'some'}
									ariaLabel={`Select ${ctx.label} group`}
									onCheckedChange={() => toggleGroup(ctx.key)}
								/>
								<Button type="button" variant="ghost" onclick={ctx.toggle}>
									{ctx.collapsed ? 'Expand' : 'Collapse'}
									{ctx.label}
									<UiBadge variant="outline">{ctx.count}</UiBadge>
								</Button>
							{/snippet}

							{#snippet cell(row, col)}
								{#if col.key === 'select'}
									<DataTable.SelectionCheckbox
										checked={selectedIds.has(row.id)}
										ariaLabel={`Select ${row.rank} ${row.lastName}, ${row.firstName}`}
										onCheckedChange={() => togglePerson(row.id)}
									/>
								{:else}
									{String(col.value(row) ?? '')}
								{/if}
							{/snippet}
						</DataTable.DataTable>
					</div>
				</div>
			</section>
		</div>
	{:else}
		<div class="confirm-stage">
			<section class="confirm-card">
				<div class="pane-heading confirm-heading">
					<span class="pane-eyebrow">Review</span>
					<h2 class="pane-title">Review matching entries</h2>
					<p class="pane-copy">
						Nothing is removed until you confirm. Entries that only partially overlap your selected dates are still
						removed in full.
					</p>
				</div>

				<div class="confirm-criteria">
					{#if selectedStatus}
						<CalendarStatusBadge statusType={selectedStatus}>{selectedStatus.name}</CalendarStatusBadge>
					{/if}
					<UiBadge variant="outline">{selectedIds.size} selected</UiBadge>
					<UiBadge variant="outline">
						{startDate === endDate
							? formatDateDisplay(startDate)
							: `${formatDateDisplay(startDate)} to ${formatDateDisplay(endDate)}`}
					</UiBadge>
				</div>

				<div class="confirm-content">
					{#if matchResult.exact.length === 0 && matchResult.partial.length === 0}
						<div class="no-matches">
							<p>No matching status entries were found for the selected criteria.</p>
						</div>
					{:else}
						{#if matchResult.exact.length > 0}
							<div class="match-section">
								<h4 class="match-heading">
									<span class="match-count">{matchResult.exact.length}</span>
									exact {matchResult.exact.length === 1 ? 'match' : 'matches'} will be removed
								</h4>
							</div>
						{/if}

						{#if matchResult.partial.length > 0}
							<div class="match-section partial-section">
								<h4 class="match-heading warning">
									<svg class="warning-icon" viewBox="0 0 20 20" fill="currentColor">
										<path
											fill-rule="evenodd"
											d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
											clip-rule="evenodd"
										/>
									</svg>
									<span class="match-count">{matchResult.partial.length}</span>
									partial {matchResult.partial.length === 1 ? 'overlap' : 'overlaps'} will also be removed entirely
								</h4>
								<p class="partial-explanation">These entries extend beyond your selected date range:</p>
								<div class="partial-list">
									{#each matchResult.partial as entry (entry.id)}
										<div class="partial-item">
											<span class="partial-person">{getPersonName(entry.personnelId)}</span>
											<span class="partial-dates"
												>{formatDateDisplay(entry.startDate)} – {formatDateDisplay(entry.endDate)}</span
											>
										</div>
									{/each}
								</div>
							</div>
						{/if}

						<div class="total-summary">
							<strong>{matchResult.exact.length + matchResult.partial.length}</strong>
							total {matchResult.exact.length + matchResult.partial.length === 1 ? 'entry' : 'entries'} will be permanently
							removed.
						</div>
					{/if}
				</div>

				<div class="confirm-footer">
					<Button variant="outline" onclick={handleBack}>Back</Button>
					<div class="confirm-footer-fill"></div>
					{#if matchResult.exact.length > 0 || matchResult.partial.length > 0}
						<Button variant="destructive" disabled={isSubmitting} onclick={handleConfirmRemoval}>
							{#if isSubmitting}
								<Spinner />
								Removing...
							{:else}
								Confirm Removal
							{/if}
						</Button>
					{/if}
				</div>
			</section>
		</div>
	{/if}
</div>

<style>
	.bulk-remove-panel {
		padding: 0;
	}

	.bulk-workspace {
		display: grid;
		grid-template-columns: minmax(320px, 380px) minmax(0, 1fr);
		gap: 1.5rem;
		align-items: start;
	}

	.controls-column,
	.selection-column {
		min-width: 0;
	}

	.controls-column {
		align-self: start;
		position: sticky;
		top: calc(var(--app-shell-header-height, 56px) + 1.5rem);
	}

	.controls-card,
	.selection-card,
	.confirm-card {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--card);
	}

	.controls-card {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding: 1.5rem;
	}

	.selection-card {
		display: flex;
		flex-direction: column;
	}

	.confirm-card {
		max-width: 980px;
		margin: 0 auto;
		overflow: hidden;
	}

	.pane-heading {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.selection-heading,
	.confirm-heading {
		padding: 1.5rem;
		border-bottom: 1px solid var(--border);
		background: var(--muted);
	}

	.pane-eyebrow {
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--destructive);
	}

	.pane-title {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 1.25rem;
		font-weight: 400;
		line-height: 1.1;
	}

	.pane-copy {
		font-size: 0.75rem;
		color: var(--muted-foreground);
	}

	.config-grid {
		display: grid;
		gap: 1rem;
	}

	.date-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
		align-items: start;
	}

	.day-count-number {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--accent);
	}

	.date-error {
		color: var(--destructive);
		font-size: 0.75rem;
		padding: 0.25rem 0.5rem;
		background: color-mix(in srgb, var(--destructive) 12%, transparent);
		border-radius: var(--radius);
	}

	.summary-card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1rem;
		border-radius: var(--radius);
		background: var(--muted);
		border: 1px solid var(--border);
	}

	.warning-summary {
		background: color-mix(in srgb, var(--accent) 10%, var(--card));
		border-color: color-mix(in srgb, var(--accent) 28%, var(--border));
	}

	.summary-heading {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--muted-foreground);
	}

	.summary-line,
	.confirm-criteria {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.summary-copy {
		font-size: 0.75rem;
		color: var(--foreground);
	}

	.summary-copy strong {
		font-weight: 700;
	}

	.summary-copy.muted {
		color: var(--muted-foreground);
	}

	.summary-copy.error {
		color: var(--destructive);
	}

	.personnel-section {
		padding: 0;
	}

	.personnel-section :global(.data-table) {
		border: none;
		border-radius: 0;
		overflow: visible;
	}

	.confirm-stage {
		padding: 0.5rem 0;
	}

	.confirm-criteria {
		padding: 1rem 1.5rem;
		border-bottom: 1px solid var(--border);
		background: var(--muted);
	}

	.confirm-content {
		padding: 1.5rem;
		min-height: 150px;
	}

	.confirm-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.5rem;
		border-top: 1px solid var(--border);
		background: var(--card);
	}

	.confirm-footer-fill {
		flex: 1;
	}

	.no-matches {
		text-align: center;
		color: var(--muted-foreground);
		padding: 2rem;
	}

	.match-section {
		margin-bottom: 1.5rem;
	}

	.match-heading {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1rem;
		font-weight: 600;
		margin: 0 0 0.5rem 0;
	}

	.match-heading.warning {
		color: var(--color-warning, #b45309);
	}

	.warning-icon {
		width: 20px;
		height: 20px;
		color: #f59e0b;
		flex-shrink: 0;
	}

	.match-count {
		font-weight: 700;
		font-size: 1rem;
	}

	.partial-explanation {
		font-size: 0.75rem;
		color: var(--muted-foreground);
		margin: 0 0 0.5rem 0;
	}

	.partial-list {
		max-height: 180px;
		overflow-y: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.partial-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 1rem;
		font-size: 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.partial-item:last-child {
		border-bottom: none;
	}

	.partial-person {
		font-weight: 500;
	}

	.partial-dates {
		color: var(--muted-foreground);
		white-space: nowrap;
	}

	.partial-section {
		padding: 1rem;
		background: color-mix(in srgb, #f59e0b 10%, transparent);
		border: 1px solid color-mix(in srgb, #f59e0b 30%, transparent);
		border-radius: var(--radius);
	}

	.total-summary {
		margin-top: 1rem;
		padding: 1rem;
		background: var(--background);
		border-radius: var(--radius);
		font-size: 0.75rem;
		text-align: center;
		color: var(--muted-foreground);
	}

	.total-summary strong {
		color: var(--foreground);
	}

	@media (max-width: 1100px) {
		.bulk-remove-panel {
			padding: 0;
		}

		.bulk-workspace {
			grid-template-columns: 1fr;
		}

		.controls-column {
			position: static;
		}
	}

	@media (max-width: 640px) {
		.controls-card,
		.selection-heading,
		.confirm-heading,
		.confirm-content,
		.confirm-criteria,
		.confirm-footer {
			padding-left: 1rem;
			padding-right: 1rem;
		}

		.date-grid {
			grid-template-columns: 1fr;
		}

		.partial-item,
		.confirm-footer {
			align-items: flex-start;
		}

		.partial-item {
			flex-direction: column;
			gap: 0.25rem;
		}
	}
</style>
