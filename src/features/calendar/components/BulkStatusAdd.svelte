<script lang="ts">
	import type { Personnel, StatusType } from '$lib/types';
	import { formatDate } from '$lib/utils/dates';
	import { toastStore } from '$lib/stores/toast.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import DataTable from '$lib/components/ui/data-table/DataTable.svelte';
	import { useDataTable, type ColumnDef } from '$lib/components/ui/data-table/useDataTable.svelte';

	interface GroupData {
		group: string;
		personnel: Personnel[];
	}

	interface Props {
		personnelByGroup: GroupData[];
		statusTypes: StatusType[];
		onApply: (
			personnelIds: string[],
			statusTypeId: string,
			startDate: string,
			endDate: string,
			note: string | null
		) => Promise<void>;
		onComplete: () => void;
	}

	let { personnelByGroup, statusTypes, onApply, onComplete }: Props = $props();

	const todayStr = formatDate(new Date());
	let selectedStatusId = $state('');
	let startDate = $state(todayStr);
	let endDate = $state(todayStr);
	let selectedIds = $state<Set<string>>(new Set());
	let isSubmitting = $state(false);
	let note = $state('');

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
		const start = new Date(startDate);
		const end = new Date(endDate);
		return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
	});

	const isValid = $derived(selectedStatusId && startDate && endDate && startDate <= endDate && selectedIds.size > 0);
	const selectedStatus = $derived(statusTypes.find((s) => s.id === selectedStatusId));

	$effect(() => {
		if (!selectedStatusId && statusTypes.length > 0) {
			selectedStatusId = statusTypes[0].id;
		}
	});

	function formatDateDisplay(dateStr: string): string {
		const date = new Date(dateStr + 'T00:00:00');
		return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
	}

	function handleGroupHeaderKeydown(event: KeyboardEvent, groupKey: string) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		table.toggleGroup(groupKey);
	}

	async function handleSubmit() {
		if (!isValid || isSubmitting) return;
		isSubmitting = true;
		try {
			await onApply([...selectedIds], selectedStatusId, startDate, endDate, note.trim() || null);
			const count = selectedIds.size;
			toastStore.success(`Applied status to ${count} ${count === 1 ? 'person' : 'people'}`);
			selectedIds = new Set();
			onComplete();
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="bulk-add-panel">
	<div class="bulk-workspace">
		<aside class="controls-column">
			<section class="controls-card">
				<div class="pane-heading">
					<span class="pane-eyebrow">Step 1</span>
					<h2 class="pane-title">Define the status change</h2>
					<p class="pane-copy">Set the status and date range first, then choose who it should apply to.</p>
				</div>

				<div class="config-grid">
					<div class="form-group">
						<label class="label" for="statusType">Status Type</label>
						<select id="statusType" class="select" bind:value={selectedStatusId}>
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
							<label class="label" for="startDate">Start Date</label>
							<input id="startDate" type="date" class="input" bind:value={startDate} />
						</div>

						<div class="form-group">
							<label class="label" for="endDate">End Date</label>
							<input
								id="endDate"
								type="date"
								class="input"
								bind:value={endDate}
								aria-describedby={dateError ? 'date-error' : undefined}
								aria-invalid={dateError ? true : undefined}
							/>
							{#if dayCount > 0}
								<div class="field-support">
									<span class="day-count-number">{dayCount}</span>
									<span class="field-hint">{dayCount === 1 ? 'day selected' : 'days selected'}</span>
								</div>
							{/if}
						</div>
					</div>

					{#if dateError}
						<div id="date-error" class="date-error" role="alert">{dateError}</div>
					{/if}

					<div class="form-group">
						<label class="label" for="bulkNote">Note</label>
						<input
							id="bulkNote"
							type="text"
							class="input"
							bind:value={note}
							maxlength={200}
							placeholder="Optional note (e.g., JRTC rotation)"
						/>
					</div>
				</div>

				<div class="summary-card" aria-live="polite">
					<h3 class="summary-heading">Ready to apply</h3>
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
					{:else if selectedIds.size === 0}
						<p class="summary-copy muted">Choose at least one person from the list to enable the bulk update.</p>
					{:else if dateError}
						<p class="summary-copy error">{dateError}</p>
					{/if}
				</div>

				<button class="btn btn-primary btn-lg apply-button" disabled={!isValid || isSubmitting} onclick={handleSubmit}>
					{#if isSubmitting}
						<Spinner />
						Applying...
					{:else}
						Apply Status
					{/if}
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
</div>

<style>
	.bulk-add-panel {
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
	.selection-card {
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

	.pane-heading {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.selection-heading {
		padding: var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface-variant);
	}

	.pane-eyebrow {
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-bold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-primary);
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

	.summary-heading {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
	}

	.summary-line,
	.selection-meta,
	.selection-stats,
	.selection-toolbar {
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
		background: rgba(var(--color-primary-rgb), 0.12);
		border-color: rgba(var(--color-primary-rgb), 0.22);
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

	@media (max-width: 1100px) {
		.bulk-add-panel {
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
		.selection-heading {
			padding: var(--spacing-md);
		}

		.date-grid {
			grid-template-columns: 1fr;
		}

		.selection-toolbar {
			align-items: flex-start;
		}
	}
</style>
