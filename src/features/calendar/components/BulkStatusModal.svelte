<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { StatusType } from '$features/calendar/calendar.types';
	import { formatDate } from '$lib/utils/dates';
	import Modal from '$lib/components/Modal.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	interface GroupData {
		group: string;
		personnel: Personnel[];
	}

	interface Props {
		personnelByGroup: GroupData[];
		statusTypes: StatusType[];
		onApply: (personnelIds: string[], statusTypeId: string, startDate: string, endDate: string, note: string | null) => Promise<void>;
		onClose: () => void;
		onImport?: () => void;
	}

	let { personnelByGroup, statusTypes, onApply, onClose, onImport }: Props = $props();

	const todayStr = formatDate(new Date());
	let selectedStatusId = $state('');
	let startDate = $state(todayStr);

	// Reset selected status when statusTypes prop changes
	$effect(() => {
		selectedStatusId = statusTypes[0]?.id ?? '';
	});
	let endDate = $state(todayStr);
	let selectedIds = $state<Set<string>>(new Set());
	let searchQuery = $state('');
	let isSubmitting = $state(false);
	let note = $state('');
	let collapsedGroups = $state<Set<string>>(new Set());

	const allPersonnel = $derived(
		personnelByGroup.flatMap((g) => g.personnel)
	);

	const filteredGroups = $derived.by(() => {
		if (!searchQuery.trim()) return personnelByGroup;

		const query = searchQuery.toLowerCase();
		return personnelByGroup
			.map((g) => ({
				...g,
				personnel: g.personnel.filter(
					(p) =>
						p.lastName.toLowerCase().includes(query) ||
						p.firstName.toLowerCase().includes(query) ||
						p.rank.toLowerCase().includes(query) ||
						p.mos.toLowerCase().includes(query) ||
						p.clinicRole.toLowerCase().includes(query)
				)
			}))
			.filter((g) => g.personnel.length > 0);
	});

	const dateError = $derived.by(() => {
		if (startDate && endDate && startDate > endDate) {
			return 'End date must be on or after start date';
		}
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

	function togglePerson(id: string) {
		const newSet = new Set(selectedIds);
		if (newSet.has(id)) {
			newSet.delete(id);
		} else {
			newSet.add(id);
		}
		selectedIds = newSet;
	}

	function selectAll() {
		const visibleIds = filteredGroups.flatMap((g) => g.personnel.map((p) => p.id));
		selectedIds = new Set(visibleIds);
	}

	function selectNone() {
		selectedIds = new Set();
	}

	function getGroupPersonnel(groupName: string): Personnel[] {
		return allPersonnel.filter((p) => p.groupName === groupName);
	}

	function getGroupSelectionState(groupName: string): 'none' | 'some' | 'all' {
		const groupPersonnel = getGroupPersonnel(groupName);
		const selectedCount = groupPersonnel.filter((p) => selectedIds.has(p.id)).length;
		if (selectedCount === 0) return 'none';
		if (selectedCount === groupPersonnel.length) return 'all';
		return 'some';
	}

	function toggleGroup(groupName: string) {
		const groupPersonnel = getGroupPersonnel(groupName);
		const state = getGroupSelectionState(groupName);
		const newSet = new Set(selectedIds);

		if (state === 'all') {
			// Deselect all in group
			for (const p of groupPersonnel) {
				newSet.delete(p.id);
			}
		} else {
			// Select all in group
			for (const p of groupPersonnel) {
				newSet.add(p.id);
			}
		}
		selectedIds = newSet;
	}

	function toggleGroupCollapse(groupName: string) {
		const newSet = new Set(collapsedGroups);
		if (newSet.has(groupName)) {
			newSet.delete(groupName);
		} else {
			newSet.add(groupName);
		}
		collapsedGroups = newSet;
	}

	function clearSearch() {
		searchQuery = '';
	}

	async function handleSubmit() {
		if (!isValid || isSubmitting) return;

		isSubmitting = true;
		try {
			await onApply([...selectedIds], selectedStatusId, startDate, endDate, note.trim() || null);
			onClose();
		} finally {
			isSubmitting = false;
		}
	}
</script>

<Modal
	title="Bulk Status Assignment"
	{onClose}
	width="600px"
	titleId="bulk-status-title"
>
	<div class="modal-content">
			<!-- Status & Date Configuration -->
			<div class="config-section">
				<div class="config-row">
					<div class="form-group status-select">
						<label class="label" for="statusType">Status Type</label>
						<select id="statusType" class="select" bind:value={selectedStatusId}>
							{#each statusTypes as status}
								<option value={status.id}>{status.name}</option>
							{/each}
						</select>
					</div>
					{#if selectedStatus}
						<div class="status-preview">
							<span
								class="status-badge"
								style="background-color: {selectedStatus.color}; color: {selectedStatus.textColor}"
							>
								{selectedStatus.name}
							</span>
						</div>
					{/if}
				</div>

				<div class="config-row dates-row">
					<div class="form-group">
						<label class="label" for="startDate">Start Date</label>
						<input id="startDate" type="date" class="input" bind:value={startDate} />
					</div>
					<span class="date-arrow">→</span>
					<div class="form-group">
						<label class="label" for="endDate">End Date</label>
						<input id="endDate" type="date" class="input" bind:value={endDate}
							aria-describedby={dateError ? 'date-error' : undefined}
							aria-invalid={dateError ? true : undefined}
						/>
					</div>
					{#if dayCount > 0}
						<div class="day-count">
							<span class="day-count-number">{dayCount}</span>
							<span class="day-count-label">{dayCount === 1 ? 'day' : 'days'}</span>
						</div>
					{/if}
				</div>

				{#if dateError}
					<div id="date-error" class="date-error" role="alert">{dateError}</div>
				{/if}

				<div class="config-row">
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

			<!-- Personnel Selection -->
			<div class="personnel-section">
				<div class="section-header">
					<h3>Select Personnel</h3>
					<div class="selection-info">
						<span class="selected-count">{selectedIds.size} selected</span>
						<div class="selection-actions">
							<button class="btn btn-secondary btn-sm" onclick={selectAll}>All</button>
							<button class="btn btn-secondary btn-sm" onclick={selectNone}>None</button>
						</div>
					</div>
				</div>

				<div class="search-bar">
					<div class="search-input-wrapper">
						<svg class="search-icon" viewBox="0 0 20 20" fill="currentColor">
							<path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
						</svg>
						<input
							type="text"
							class="input search-input"
							placeholder="Search by name, rank, MOS, or role..."
							aria-label="Search personnel"
							bind:value={searchQuery}
						/>
						{#if searchQuery}
							<button class="clear-search" onclick={clearSearch} aria-label="Clear search">
								<svg viewBox="0 0 20 20" fill="currentColor">
									<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
								</svg>
							</button>
						{/if}
					</div>
				</div>

				<div class="personnel-list">
					{#each filteredGroups as grp (grp.group)}
						{@const selectionState = getGroupSelectionState(grp.group)}
						{@const isCollapsed = collapsedGroups.has(grp.group)}
						<div class="group-section">
							<div class="group-header">
								<button
									class="group-collapse-btn"
									onclick={() => toggleGroupCollapse(grp.group)}
									aria-label={isCollapsed ? `Expand ${grp.group}` : `Collapse ${grp.group}`}
								>
									<svg class="collapse-icon" class:collapsed={isCollapsed} viewBox="0 0 20 20" fill="currentColor">
										<path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
									</svg>
								</button>
								<label class="group-checkbox-label">
									<input
										type="checkbox"
										checked={selectionState === 'all'}
										indeterminate={selectionState === 'some'}
										onchange={() => toggleGroup(grp.group)}
									/>
									<span class="group-name">{grp.group}</span>
									<span class="group-count">({grp.personnel.length})</span>
								</label>
							</div>
							{#if !isCollapsed}
								<div class="group-personnel">
									{#each grp.personnel as person (person.id)}
										{@const isSelected = selectedIds.has(person.id)}
										<label class="person-item" class:selected={isSelected}>
											<input
												type="checkbox"
												checked={isSelected}
												onchange={() => togglePerson(person.id)}
											/>
											<span class="rank">{person.rank}</span>
											<span class="name">{person.lastName}, {person.firstName}</span>
											{#if person.mos}
												<span class="mos">{person.mos}</span>
											{/if}
										</label>
									{/each}
								</div>
							{/if}
						</div>
					{/each}

					{#if filteredGroups.length === 0}
						<div class="empty-state">
							{#if searchQuery}
								<p>No personnel match "{searchQuery}"</p>
								<button class="btn btn-secondary btn-sm" onclick={clearSearch}>Clear search</button>
							{:else}
								<p>No personnel available</p>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</div>

	{#if onImport}
		<button class="btn-link import-link" onclick={onImport}>
			Have a spreadsheet? Import from file
		</button>
	{/if}

	{#snippet footer()}
		<div class="footer-summary">
			{#if selectedIds.size > 0 && selectedStatus && !dateError}
				<span
					class="summary-badge"
					style="background-color: {selectedStatus.color}; color: {selectedStatus.textColor}"
				>
					{selectedStatus.name}
				</span>
				<span class="summary-text">
					for <strong>{selectedIds.size}</strong> {selectedIds.size === 1 ? 'person' : 'people'}
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
			<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
			<button
				class="btn btn-primary"
				disabled={!isValid || isSubmitting}
				onclick={handleSubmit}
			>
				{#if isSubmitting}
					<Spinner />
					Applying...
				{:else}
					Apply Status
				{/if}
			</button>
		</div>
	{/snippet}
</Modal>

<style>
	.modal-content {
		display: flex;
		flex-direction: column;
		max-height: 60vh;
		overflow: hidden;
		margin: calc(-1 * var(--spacing-lg));
	}

	/* Config Section */
	.config-section {
		padding: var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-bg);
	}

	.config-row {
		display: flex;
		gap: var(--spacing-md);
		align-items: flex-end;
		margin-bottom: var(--spacing-md);
	}

	.config-row:last-child {
		margin-bottom: 0;
	}

	.status-select {
		flex: 1;
	}

	.status-preview {
		display: flex;
		align-items: center;
		padding-bottom: var(--spacing-sm);
	}

	.status-badge {
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		font-weight: 500;
		font-size: var(--font-size-sm);
	}

	.dates-row {
		align-items: center;
	}

	.dates-row .form-group {
		flex: 1;
		margin-bottom: 0;
	}

	.date-arrow {
		color: var(--color-text-muted);
		font-size: var(--font-size-lg);
		padding-bottom: var(--spacing-xs);
	}

	.day-count {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		min-width: 50px;
	}

	.day-count-number {
		font-size: var(--font-size-lg);
		font-weight: 700;
		color: var(--color-primary);
		line-height: 1;
	}

	.day-count-label {
		font-size: 10px;
		color: var(--color-text-muted);
		text-transform: uppercase;
	}

	.date-error {
		color: #dc2626;
		font-size: var(--font-size-sm);
		margin-top: var(--spacing-sm);
		padding: var(--spacing-xs) var(--spacing-sm);
		background: rgba(244, 67, 54, 0.08);
		border-radius: var(--radius-sm);
	}

	/* Personnel Section */
	.personnel-section {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-md) var(--spacing-lg);
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
	}

	.section-header h3 {
		font-size: var(--font-size-base);
		font-weight: 600;
		margin: 0;
	}

	.selection-info {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
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

	/* Search Bar */
	.search-bar {
		padding: var(--spacing-sm) var(--spacing-lg);
		background: var(--color-surface);
	}

	.search-input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	.search-icon {
		position: absolute;
		left: var(--spacing-sm);
		width: 16px;
		height: 16px;
		color: var(--color-text-muted);
		pointer-events: none;
	}

	.search-input {
		padding-left: calc(var(--spacing-sm) + 20px);
		padding-right: calc(var(--spacing-sm) + 24px);
	}

	.clear-search {
		position: absolute;
		right: var(--spacing-xs);
		padding: var(--spacing-xs);
		color: var(--color-text-muted);
		border-radius: var(--radius-sm);
		transition: color 0.15s ease;
	}

	.clear-search:hover {
		color: var(--color-text);
	}

	.clear-search svg {
		width: 16px;
		height: 16px;
	}

	/* Personnel List */
	.personnel-list {
		flex: 1;
		overflow-y: auto;
		padding: var(--spacing-sm) var(--spacing-lg);
		padding-bottom: var(--spacing-md);
	}

	.group-section {
		margin-bottom: var(--spacing-sm);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.group-header {
		display: flex;
		align-items: center;
		background: var(--color-primary);
		color: #0F0F0F;
	}

	.group-collapse-btn {
		padding: var(--spacing-sm);
		color: #0F0F0F;
		opacity: 0.8;
		transition: opacity 0.15s ease;
	}

	.group-collapse-btn:hover {
		opacity: 1;
	}

	.collapse-icon {
		width: 16px;
		height: 16px;
		transition: transform 0.15s ease;
	}

	.collapse-icon.collapsed {
		transform: rotate(-90deg);
	}

	.group-checkbox-label {
		flex: 1;
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm);
		padding-left: 0;
		cursor: pointer;
		font-weight: 600;
		font-size: var(--font-size-sm);
	}

	.group-checkbox-label input[type='checkbox'] {
		cursor: pointer;
		accent-color: #0F0F0F;
	}

	.group-name {
		flex: 1;
	}

	.group-count {
		opacity: 0.8;
		font-weight: 400;
	}

	.group-personnel {
		border-top: 1px solid rgba(0, 0, 0, 0.1);
	}

	.person-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		cursor: pointer;
		font-size: var(--font-size-sm);
		transition: background-color 0.1s ease;
		border-bottom: 1px solid var(--color-border);
	}

	.person-item:last-child {
		border-bottom: none;
	}

	.person-item:hover {
		background: var(--color-bg);
	}

	.person-item.selected {
		background: rgba(var(--color-primary-rgb), 0.08);
	}

	.person-item input[type='checkbox'] {
		cursor: pointer;
		accent-color: var(--color-primary);
	}

	.person-item .rank {
		font-weight: 600;
		color: var(--color-primary);
		min-width: 35px;
	}

	.person-item .name {
		flex: 1;
	}

	.person-item .mos {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.empty-state {
		text-align: center;
		color: var(--color-text-muted);
		padding: var(--spacing-xl);
	}

	.empty-state p {
		margin-bottom: var(--spacing-sm);
	}

	/* Footer */
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

	.import-link {
		display: block;
		text-align: center;
		margin-top: var(--spacing-md);
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
		background: none;
		border: none;
		cursor: pointer;
		text-decoration: underline;
		padding: var(--spacing-xs);
	}

	.import-link:hover {
		color: var(--color-primary);
	}

</style>
