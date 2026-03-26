<script lang="ts">
	import type { Personnel, StatusType } from '$lib/types';
	import { formatDate } from '$lib/utils/dates';
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

	$effect(() => {
		selectedStatusId = statusTypes[0]?.id ?? '';
	});
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
		const start = new Date(startDate);
		const end = new Date(endDate);
		return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
	});

	const isValid = $derived(
		selectedStatusId && startDate && endDate && startDate <= endDate && selectedIds.size > 0
	);
	const selectedStatus = $derived(statusTypes.find((s) => s.id === selectedStatusId));

	function formatDateDisplay(dateStr: string): string {
		const date = new Date(dateStr + 'T00:00:00');
		return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
	}

	async function handleSubmit() {
		if (!isValid || isSubmitting) return;
		isSubmitting = true;
		try {
			await onApply([...selectedIds], selectedStatusId, startDate, endDate, note.trim() || null);
			onComplete();
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="bulk-add-panel">
	<!-- Status & Date Configuration -->
	<div class="config-section">
		<div class="form-row config-row">
			<div class="field-stack">
				<div class="form-group">
					<label class="label" for="statusType">Status Type</label>
					<select id="statusType" class="select" bind:value={selectedStatusId}>
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
					<label class="label" for="startDate">Start Date</label>
					<input id="startDate" type="date" class="input" bind:value={startDate} />
				</div>
			</div>
			<span class="date-arrow">&rarr;</span>
			<div class="field-stack">
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
			<div id="date-error" class="date-error" role="alert">{dateError}</div>
		{/if}

		<div class="form-row config-row">
			<div class="form-group" style="flex: 1;">
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
					<svg
						class="chevron-icon"
						class:collapsed={ctx.collapsed}
						viewBox="0 0 20 20"
						fill="currentColor"
					>
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

	<!-- Footer -->
	<div class="panel-footer">
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
					&middot;
					{#if startDate === endDate}
						{formatDateDisplay(startDate)}
					{:else}
						{formatDateDisplay(startDate)} – {formatDateDisplay(endDate)}
					{/if}
				</span>
			{:else if selectedIds.size === 0}
				<span class="summary-hint">Select personnel to continue</span>
			{:else if dateError}
				<span class="summary-error">{dateError}</span>
			{/if}
		</div>
		<div class="footer-actions">
			<button class="btn btn-primary" disabled={!isValid || isSubmitting} onclick={handleSubmit}>
				{#if isSubmitting}
					<Spinner />
					Applying...
				{:else}
					Apply Status
				{/if}
			</button>
		</div>
	</div>
</div>

<style>
	.bulk-add-panel {
		display: flex;
		flex-direction: column;
		max-height: calc(100vh - 240px);
	}

	/* Config Section */
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

	/* Personnel Section — flex-fill remaining space; DataTable scrolls internally */
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

	/* Selection toolbar (rendered via DataTable toolbar snippet) */
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

	/* Group header (rendered via DataTable groupHeader snippet) */
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

	/* Footer */
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
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
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
</style>
