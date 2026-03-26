<script lang="ts">
	import type { Personnel, StatusType, AvailabilityEntry } from '$lib/types';
	import { formatDate } from '$lib/utils/dates';
	import { toastStore } from '$lib/stores/toast.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import DataTable from '$lib/components/ui/data-table/DataTable.svelte';
	import { useDataTable, type ColumnDef } from '$lib/components/ui/data-table/useDataTable.svelte';

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
	let selectedStatusId = $state(statusTypes[0]?.id ?? '');
	let startDate = $state(todayStr);
	let endDate = $state(todayStr);
	let selectedIds = $state<Set<string>>(new Set());

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
		{ key: 'mos', header: 'MOS/Role', value: (p) => p.mos || p.clinicRole }
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
		const next = new Set(selectedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedIds = next;
	}

	function selectAll() {
		const visibleIds = table.groups.flatMap((g) => g.rows.map((p) => p.id));
		selectedIds = new Set(visibleIds);
	}

	function selectNone() {
		selectedIds = new Set();
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
		const next = new Set(selectedIds);
		if (state === 'all') {
			for (const p of group.rows) next.delete(p.id);
		} else {
			for (const p of group.rows) next.add(p.id);
		}
		selectedIds = next;
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
	const personnelMap = $derived(new Map(personnelList.map((p) => [p.id, p])));

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
		<!-- Selection Step -->
		<div class="panel-content">
			<!-- Status & Date Configuration -->
			<div class="config-section">
				<div class="form-row config-row">
					<div class="field-stack">
						<div class="form-group">
							<label class="label" for="removeStatusType">Status Type</label>
							<select id="removeStatusType" class="select" bind:value={selectedStatusId}>
								{#each statusTypes as status (status.id)}
									<option value={status.id}>{status.name}</option>
								{/each}
							</select>
						</div>
						{#if selectedStatus}
							<div class="field-support">
								<span
									class="status-badge"
									style="background-color: {selectedStatus.color}; color: {selectedStatus.textColor}"
								>
									{selectedStatus.name}
								</span>
								<span class="field-hint">Selected status</span>
							</div>
						{/if}
					</div>
				</div>

				<div class="form-row config-row dates-row">
					<div class="field-stack">
						<div class="form-group">
							<label class="label" for="removeStartDate">Start Date</label>
							<input id="removeStartDate" type="date" class="input" bind:value={startDate} />
						</div>
					</div>
					<span class="date-arrow">&rarr;</span>
					<div class="field-stack">
						<div class="form-group">
							<label class="label" for="removeEndDate">End Date</label>
							<input id="removeEndDate" type="date" class="input" bind:value={endDate} />
						</div>
						{#if dayCount > 0}
							<div class="field-support">
								<span class="day-count-number">{dayCount}</span>
								<span class="field-hint">{dayCount === 1 ? 'day selected' : 'days selected'}</span>
							</div>
						{/if}
					</div>
				</div>

				{#if dateError}
					<div class="date-error" role="alert">{dateError}</div>
				{/if}
			</div>

			<!-- Personnel Selection via DataTable -->
			<div class="personnel-section">
				<DataTable
					{columns}
					{table}
					compact
					showSearch
					searchPlaceholder="Search by name, rank, MOS, or role..."
					emptyMessage="No personnel available"
					onRowClick={(person) => togglePerson(person.id)}
				>
					{#snippet toolbar(_state)}
						<div class="selection-toolbar">
							<span class="selected-count">{selectedIds.size} of {allPersonnel.length} selected</span>
							<div class="selection-actions">
								<button class="btn btn-secondary btn-sm" onclick={selectAll}>All</button>
								<button class="btn btn-secondary btn-sm" onclick={selectNone}>None</button>
							</div>
						</div>
					{/snippet}

					{#snippet groupHeader(ctx)}
						{@const selState = getGroupSelectionState(ctx.key)}
						<div class="group-header-content" onclick={() => ctx.toggle()}>
							<input
								type="checkbox"
								checked={selState === 'all'}
								indeterminate={selState === 'some'}
								onchange={() => toggleGroup(ctx.key)}
								onclick={(e) => e.stopPropagation()}
							/>
							<svg class="chevron-icon" class:collapsed={ctx.collapsed} viewBox="0 0 20 20" fill="currentColor">
								<path
									fill-rule="evenodd"
									d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
									clip-rule="evenodd"
								/>
							</svg>
							<span class="group-label">{ctx.label}</span>
							<span class="group-count">({ctx.count})</span>
						</div>
					{/snippet}

					{#snippet cell(row, col)}
						{#if col.key === 'select'}
							<input
								type="checkbox"
								checked={selectedIds.has(row.id)}
								onchange={() => togglePerson(row.id)}
								onclick={(e) => e.stopPropagation()}
							/>
						{:else if col.key === 'rank'}
							<span class="rank-cell">{row.rank}</span>
						{:else}
							{String(col.value(row) ?? '')}
						{/if}
					{/snippet}
				</DataTable>
			</div>
		</div>
	{:else}
		<!-- Confirmation Step -->
		<div class="confirm-content">
			{#if matchResult.exact.length === 0 && matchResult.partial.length === 0}
				<div class="no-matches">
					<p>No matching status entries found for the selected criteria.</p>
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
					total {matchResult.exact.length + matchResult.partial.length === 1 ? 'entry' : 'entries'} will be permanently removed.
				</div>
			{/if}
		</div>
	{/if}

	<!-- Footer -->
	<div class="panel-footer">
		{#if step === 'select'}
			<div class="footer-summary">
				{#if selectedIds.size > 0 && selectedStatus && !dateError}
					<span
						class="summary-badge"
						style="background-color: {selectedStatus.color}; color: {selectedStatus.textColor}"
					>
						{selectedStatus.name}
					</span>
					<span class="summary-text">
						for <strong>{selectedIds.size}</strong>
						{selectedIds.size === 1 ? 'person' : 'people'}
					</span>
				{:else if selectedIds.size === 0}
					<span class="summary-hint">Select personnel to continue</span>
				{:else if dateError}
					<span class="summary-error">{dateError}</span>
				{/if}
			</div>
			<div class="footer-actions">
				<button class="btn btn-danger" disabled={!isValid} onclick={handleFindMatching}> Find Matching </button>
			</div>
		{:else}
			<button class="btn btn-secondary" onclick={handleBack}>Back</button>
			<div class="spacer"></div>
			{#if matchResult.exact.length > 0 || matchResult.partial.length > 0}
				<button class="btn btn-danger" disabled={isSubmitting} onclick={handleConfirmRemoval}>
					{#if isSubmitting}
						<Spinner />
						Removing...
					{:else}
						Confirm Removal
					{/if}
				</button>
			{/if}
		{/if}
	</div>
</div>

<style>
	/* === Panel Layout === */
	.bulk-remove-panel {
		display: flex;
		flex-direction: column;
		max-height: calc(100vh - 240px);
	}

	.panel-content {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* === Config Section === */
	.config-section {
		padding: var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-bg);
	}

	.config-row {
		margin-bottom: var(--spacing-md);
	}

	.config-row:last-child {
		margin-bottom: 0;
	}

	.status-badge {
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		font-weight: 500;
		font-size: var(--font-size-sm);
		line-height: 1.2;
	}

	.dates-row {
		align-items: flex-start;
	}

	.date-arrow {
		display: flex;
		align-items: center;
		align-self: flex-start;
		padding-top: 42px;
		color: var(--color-text-muted);
		font-size: var(--font-size-lg);
	}

	.day-count-number {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-primary);
	}

	.date-error {
		color: var(--color-error);
		font-size: var(--font-size-sm);
		margin-top: var(--spacing-sm);
		padding: var(--spacing-xs) var(--spacing-sm);
		background: rgba(244, 67, 54, 0.08);
		border-radius: var(--radius-sm);
	}

	@media (max-width: 640px) {
		.date-arrow {
			align-self: center;
			justify-content: center;
			padding-top: 0;
		}
	}

	/* === Personnel Section — flex-fill remaining space; DataTable scrolls internally === */
	.personnel-section {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.personnel-section :global(.data-table) {
		border: none;
		border-radius: 0;
		height: 100%;
		overflow-y: auto;
	}

	/* Selection toolbar */
	.selection-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 1px solid var(--color-divider);
	}

	.selected-count {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		font-weight: 500;
	}

	.selection-actions {
		display: flex;
		gap: var(--spacing-xs);
	}

	/* Group header */
	.group-header-content {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		cursor: pointer;
	}

	.group-header-content input[type='checkbox'] {
		cursor: pointer;
		accent-color: var(--color-primary);
	}

	.chevron-icon {
		width: 16px;
		height: 16px;
		transition: transform 0.15s ease;
		flex-shrink: 0;
	}

	.chevron-icon.collapsed {
		transform: rotate(-90deg);
	}

	.group-label {
		font-weight: 600;
	}

	.group-count {
		color: var(--color-text-muted);
		font-weight: 400;
	}

	/* Cell styles */
	.rank-cell {
		font-weight: 600;
		color: var(--color-primary);
	}

	/* === Panel Footer === */
	.panel-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-md) var(--spacing-lg);
		border-top: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.footer-summary {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-sm);
		flex: 1;
		min-width: 0;
	}

	.summary-badge {
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		font-weight: 500;
		font-size: var(--font-size-sm);
		flex-shrink: 0;
	}

	.summary-text {
		color: var(--color-text-muted);
	}

	.summary-text strong {
		color: var(--color-text);
	}

	.summary-hint {
		color: var(--color-text-muted);
		font-style: italic;
	}

	.summary-error {
		color: var(--color-error);
	}

	.footer-actions {
		display: flex;
		gap: var(--spacing-sm);
		flex-shrink: 0;
	}

	.spacer {
		flex: 1;
	}

	/* === Confirmation Step === */
	.confirm-content {
		padding: var(--spacing-lg);
		min-height: 150px;
	}

	.no-matches {
		text-align: center;
		color: var(--color-text-muted);
		padding: var(--spacing-xl);
	}

	.match-section {
		margin-bottom: var(--spacing-lg);
	}

	.match-heading {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-base);
		font-weight: 600;
		margin: 0 0 var(--spacing-sm) 0;
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
		font-size: var(--font-size-lg);
	}

	.partial-explanation {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin: 0 0 var(--spacing-sm) 0;
	}

	.partial-list {
		max-height: 180px;
		overflow-y: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.partial-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--spacing-sm) var(--spacing-md);
		font-size: var(--font-size-sm);
		border-bottom: 1px solid var(--color-border);
	}

	.partial-item:last-child {
		border-bottom: none;
	}

	.partial-person {
		font-weight: 500;
	}

	.partial-dates {
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	.partial-section {
		padding: var(--spacing-md);
		background: color-mix(in srgb, #f59e0b 10%, transparent);
		border: 1px solid color-mix(in srgb, #f59e0b 30%, transparent);
		border-radius: var(--radius-md);
	}

	.total-summary {
		margin-top: var(--spacing-md);
		padding: var(--spacing-md);
		background: var(--color-bg);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		text-align: center;
		color: var(--color-text-muted);
	}

	.total-summary strong {
		color: var(--color-text);
	}
</style>
