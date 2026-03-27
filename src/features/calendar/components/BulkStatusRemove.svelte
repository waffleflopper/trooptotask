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
	let selectedStatusId = $state('');
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

	function getVisiblePersonnelIds(): string[] {
		const groupedIds = table.groups.flatMap((g) => g.rows.map((p) => p.id));
		return groupedIds.length > 0 ? groupedIds : table.rows.map((p) => p.id);
	}

	function selectVisible() {
		selectedIds = new Set([...selectedIds, ...getVisiblePersonnelIds()]);
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

	$effect(() => {
		if (!selectedStatusId && statusTypes.length > 0) {
			selectedStatusId = statusTypes[0].id;
		}
	});

	function formatDateDisplay(dateStr: string): string {
		const date = new Date(dateStr + 'T00:00:00');
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function handleGroupHeaderKeydown(event: KeyboardEvent, groupKey: string) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		table.toggleGroup(groupKey);
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
						<div class="form-group">
							<label class="label" for="removeStatusType">Status Type</label>
							<select id="removeStatusType" class="select" bind:value={selectedStatusId}>
								{#each statusTypes as status (status.id)}
									<option value={status.id}>{status.name}</option>
								{/each}
							</select>
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

						<div class="date-grid">
							<div class="form-group">
								<label class="label" for="removeStartDate">Start Date</label>
								<input id="removeStartDate" type="date" class="input" bind:value={startDate} />
							</div>

							<div class="form-group">
								<label class="label" for="removeEndDate">End Date</label>
								<input id="removeEndDate" type="date" class="input" bind:value={endDate} />
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

					<div class="summary-card warning-summary" aria-live="polite">
						<h3 class="summary-heading">Removal summary</h3>
						{#if selectedIds.size > 0 && selectedStatus && !dateError}
							<div class="summary-line">
								<span
									class="summary-badge"
									style="background-color: {selectedStatus.color}; color: {selectedStatus.textColor}"
								>
									{selectedStatus.name}
								</span>
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

					<button class="btn btn-danger btn-lg apply-button" disabled={!isValid} onclick={handleFindMatching}>
						Review Matching Entries
					</button>
				</section>
			</aside>

			<section class="selection-column">
				<div class="selection-card">
					<div class="pane-heading selection-heading">
						<span class="pane-eyebrow">Step 2</span>
						<h2 class="pane-title">Choose personnel</h2>
						<p class="pane-copy">Search by name, select an entire group, or click individual rows.</p>
						<div class="selection-meta">
							<span class="selection-chip strong">{selectedIds.size} selected</span>
							<span class="selection-chip">{allPersonnel.length} available</span>
						</div>
					</div>

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
									<div class="selection-stats">
										<span class="selected-count">{selectedIds.size} selected</span>
										<span class="visible-count">{table.totalRows} shown</span>
									</div>
									<div class="selection-actions">
										<button class="btn btn-secondary btn-sm" onclick={selectVisible}>Select shown</button>
										<button class="btn btn-secondary btn-sm" onclick={selectNone}>Clear</button>
									</div>
								</div>
							{/snippet}

							{#snippet groupHeader(ctx)}
								{@const selState = getGroupSelectionState(ctx.key)}
								<div
									class="group-header-content"
									role="button"
									tabindex="0"
									onclick={() => ctx.toggle()}
									onkeydown={(event) => handleGroupHeaderKeydown(event, ctx.key)}
								>
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
						<span
							class="summary-badge"
							style="background-color: {selectedStatus.color}; color: {selectedStatus.textColor}"
						>
							{selectedStatus.name}
						</span>
					{/if}
					<span class="selection-chip strong">{selectedIds.size} selected</span>
					<span class="selection-chip">
						{#if startDate === endDate}
							{formatDateDisplay(startDate)}
						{:else}
							{formatDateDisplay(startDate)} to {formatDateDisplay(endDate)}
						{/if}
					</span>
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
		gap: var(--spacing-lg);
		align-items: start;
	}

	.controls-column,
	.selection-column {
		min-width: 0;
	}

	.controls-column {
		align-self: start;
		position: sticky;
		top: calc(var(--header-height, 56px) + var(--spacing-lg));
	}

	.controls-card,
	.selection-card,
	.confirm-card {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
	}

	.controls-card {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
		padding: var(--spacing-lg);
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
		gap: var(--spacing-xs);
	}

	.selection-heading,
	.confirm-heading {
		padding: var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface-variant);
	}

	.pane-eyebrow {
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-bold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-error);
	}

	.pane-title {
		font-family: var(--font-display);
		font-size: var(--font-size-xl);
		font-weight: 400;
		line-height: 1.1;
	}

	.pane-copy {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}

	.config-grid {
		display: grid;
		gap: var(--spacing-md);
	}

	.config-grid .form-group {
		margin-bottom: 0;
	}

	.date-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--spacing-md);
		align-items: start;
	}

	.status-badge,
	.summary-badge,
	.selection-chip,
	.selected-count,
	.visible-count {
		display: inline-flex;
		align-items: center;
		border-radius: var(--radius-full);
		font-size: var(--font-size-sm);
		line-height: 1;
	}

	.day-count-number {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-primary);
	}

	.date-error {
		color: var(--color-error);
		font-size: var(--font-size-sm);
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-error-tint);
		border-radius: var(--radius-sm);
	}

	.status-badge,
	.summary-badge {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-weight: 500;
	}

	.summary-card {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		padding: var(--spacing-md);
		border-radius: var(--radius-lg);
		background: var(--color-surface-variant);
		border: 1px solid var(--color-border);
	}

	.warning-summary {
		background: color-mix(in srgb, var(--color-warning) 10%, var(--color-surface));
		border-color: color-mix(in srgb, var(--color-warning) 28%, var(--color-border));
	}

	.summary-heading {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
	}

	.summary-line,
	.selection-meta,
	.selection-stats,
	.selection-toolbar,
	.confirm-criteria {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--spacing-sm);
	}

	.summary-copy {
		font-size: var(--font-size-sm);
		color: var(--color-text);
	}

	.summary-copy strong {
		font-weight: var(--font-weight-bold);
	}

	.summary-copy.muted {
		color: var(--color-text-muted);
	}

	.summary-copy.error {
		color: var(--color-error);
	}

	.apply-button {
		width: 100%;
	}

	.selection-chip,
	.selected-count,
	.visible-count {
		padding: 8px 12px;
		font-size: var(--font-size-sm);
		font-weight: 500;
		background: var(--color-surface-variant);
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
	}

	.selection-chip.strong,
	.selected-count {
		background: rgba(var(--color-error-rgb), 0.08);
		border-color: rgba(var(--color-error-rgb), 0.16);
		color: var(--color-text);
	}

	.personnel-section {
		padding: 0;
	}

	.personnel-section :global(.data-table) {
		border: none;
		border-radius: 0;
		overflow: visible;
	}

	.selection-toolbar {
		justify-content: space-between;
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 1px solid var(--color-divider);
		background: var(--color-surface);
	}

	.selection-actions {
		display: flex;
		gap: var(--spacing-xs);
		flex-wrap: wrap;
	}

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

	.rank-cell {
		font-weight: 600;
		color: var(--color-primary);
	}

	.confirm-stage {
		padding: var(--spacing-sm) 0;
	}

	.confirm-criteria {
		padding: var(--spacing-md) var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface-variant);
	}

	.confirm-content {
		padding: var(--spacing-lg);
		min-height: 150px;
	}

	.confirm-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-md) var(--spacing-lg);
		border-top: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.spacer {
		flex: 1;
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
			padding-left: var(--spacing-md);
			padding-right: var(--spacing-md);
		}

		.date-grid {
			grid-template-columns: 1fr;
		}

		.selection-toolbar,
		.partial-item,
		.confirm-footer {
			align-items: flex-start;
		}

		.partial-item {
			flex-direction: column;
			gap: var(--spacing-xs);
		}
	}
</style>
