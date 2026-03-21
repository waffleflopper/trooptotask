<script lang="ts">
	import type { Personnel, StatusType, AvailabilityEntry } from '$lib/types';
	import { formatDate } from '$lib/utils/dates';
	import { toastStore } from '$lib/stores/toast.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';

	interface Props {
		person: Personnel;
		date: Date;
		statusTypes: StatusType[];
		existingEntries: AvailabilityEntry[];
		onAdd: (data: Omit<AvailabilityEntry, 'id'>) => void;
		onRemove: (id: string) => void;
		onClose: () => void;
	}

	let { person, date, statusTypes, existingEntries, onAdd, onRemove, onClose }: Props = $props();

	const dateStr = $derived(formatDate(date));

	// Local state for the entries list — updated immediately on add/remove to avoid
	// reactive prop propagation timing issues (notably in Firefox)
	let localEntries = $state<AvailabilityEntry[]>([]);

	// Sync local entries when the prop changes (e.g. server replaces temp IDs)
	$effect(() => {
		localEntries = existingEntries.filter(
			(e) => e.personnelId === person.id && dateStr >= e.startDate && dateStr <= e.endDate
		);
	});

	// Form state
	let selectedStatusId = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let editingEntry = $state<AvailabilityEntry | null>(null);
	let note = $state('');

	// Reset form state when props change (e.g. modal reopened with different data)
	$effect(() => {
		selectedStatusId = statusTypes[0]?.id ?? '';
		startDate = dateStr;
		endDate = dateStr;
	});

	const dateDisplay = $derived(
		date.toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		})
	);

	const dateError = $derived.by(() => {
		if (startDate && endDate && startDate > endDate) {
			return 'End date must be on or after start date';
		}
		return null;
	});

	const dayCount = $derived.by(() => {
		if (!startDate || !endDate || startDate > endDate) return 0;
		const start = new Date(startDate + 'T00:00:00');
		const end = new Date(endDate + 'T00:00:00');
		return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
	});

	function startEdit(entry: AvailabilityEntry) {
		editingEntry = entry;
		selectedStatusId = entry.statusTypeId;
		startDate = entry.startDate;
		endDate = entry.endDate;
		note = entry.note ?? '';
	}

	function cancelEdit() {
		editingEntry = null;
		selectedStatusId = statusTypes[0]?.id ?? '';
		startDate = dateStr;
		endDate = dateStr;
		note = '';
	}

	function handleSubmit() {
		if (!selectedStatusId || !startDate || !endDate || startDate > endDate) return;

		const newData = {
			personnelId: person.id,
			statusTypeId: selectedStatusId,
			startDate,
			endDate,
			note: note.trim() || null
		};

		if (editingEntry) {
			// Remove the old entry from local state immediately
			localEntries = localEntries.filter((e) => e.id !== editingEntry!.id);
			onRemove(editingEntry.id);
			editingEntry = null;
		}

		// Add to local state immediately so the list updates without waiting for prop
		if (dateStr >= newData.startDate && dateStr <= newData.endDate) {
			const tempEntry: AvailabilityEntry = { id: `temp-${crypto.randomUUID()}`, ...newData };
			localEntries = [...localEntries, tempEntry];
		}
		onAdd(newData);
		toastStore.success(editingEntry ? 'Status updated' : 'Status added');

		// Reset form
		selectedStatusId = statusTypes[0]?.id ?? '';
		startDate = dateStr;
		endDate = dateStr;
		note = '';
	}

	let removeEntryId = $state<string | null>(null);

	function handleRemove(entryId: string) {
		removeEntryId = entryId;
	}

	function doRemove() {
		if (removeEntryId) {
			localEntries = localEntries.filter((e) => e.id !== removeEntryId);
			onRemove(removeEntryId);
			toastStore.success('Status removed');
			removeEntryId = null;
		}
	}

	function getStatusName(statusId: string): string {
		return statusTypes.find((s) => s.id === statusId)?.name ?? 'Unknown';
	}

	function getStatusColor(statusId: string): string {
		return statusTypes.find((s) => s.id === statusId)?.color ?? '#6b7280';
	}

	function getStatusTextColor(statusId: string): string {
		return statusTypes.find((s) => s.id === statusId)?.textColor ?? '#ffffff';
	}

	function formatEntryDates(entry: AvailabilityEntry): string {
		const start = new Date(entry.startDate + 'T00:00:00');
		const end = new Date(entry.endDate + 'T00:00:00');
		const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		if (entry.startDate === entry.endDate) return startStr;
		return `${startStr} – ${endStr}`;
	}

	function getDayCountForEntry(entry: AvailabilityEntry): number {
		const start = new Date(entry.startDate + 'T00:00:00');
		const end = new Date(entry.endDate + 'T00:00:00');
		return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
	}
</script>

<Modal title="Set Status" {onClose} width="480px" titleId="availability-title">
	<!-- Person Info -->
	<div class="person-info">
		<div class="person-name">
			<span class="rank">{person.rank}</span>
			<span class="name">{person.lastName}, {person.firstName}</span>
		</div>
		<div class="clicked-date">{dateDisplay}</div>
	</div>

	<!-- Existing Entries -->
	{#if localEntries.length > 0}
		<div class="existing-entries">
			<h4>Current Status</h4>
			{#each localEntries as entry (entry.id)}
				<div class="entry-item" class:is-editing={editingEntry?.id === entry.id}>
					<Badge
						label={getStatusName(entry.statusTypeId)}
						color={getStatusColor(entry.statusTypeId)}
						textColor={getStatusTextColor(entry.statusTypeId)}
					/>
					<div class="entry-details">
						<span class="entry-dates">{formatEntryDates(entry)}</span>
						<span class="entry-days">
							({getDayCountForEntry(entry)}
							{getDayCountForEntry(entry) === 1 ? 'day' : 'days'})
						</span>
						{#if entry.note}
							<span class="entry-note" title={entry.note}>{entry.note}</span>
						{/if}
					</div>
					{#if !entry.id.startsWith('temp-')}
						<button
							class="btn btn-secondary btn-sm icon-btn"
							onclick={() => startEdit(entry)}
							title="Edit"
							aria-label="Edit status"
						>
							<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
								<path
									d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"
								/>
							</svg>
						</button>
						<button
							class="btn btn-danger btn-sm icon-btn"
							onclick={() => handleRemove(entry.id)}
							title="Remove"
							aria-label="Remove status"
						>
							<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
								<path
									fill-rule="evenodd"
									d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
									clip-rule="evenodd"
								/>
							</svg>
						</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Add/Edit Form -->
	<div class="add-section">
		{#if editingEntry}
			<h4>Edit Status</h4>
		{:else}
			<h4>{localEntries.length > 0 ? 'Add Another Status' : 'Add Status'}</h4>
		{/if}

		<div class="form-group">
			<label class="label" for="statusType">Status Type <span class="required">*</span></label>
			<div class="status-select-row">
				<select id="statusType" class="select" bind:value={selectedStatusId}>
					{#each statusTypes as status}
						<option value={status.id}>{status.name}</option>
					{/each}
				</select>
				{#if selectedStatusId}
					{@const selectedStatus = statusTypes.find((s) => s.id === selectedStatusId)}
					{#if selectedStatus}
						<Badge label={selectedStatus.name} color={selectedStatus.color} textColor={selectedStatus.textColor} />
					{/if}
				{/if}
			</div>
		</div>

		<div class="date-range">
			<div class="form-group">
				<label class="label" for="startDate">Start Date <span class="required">*</span></label>
				<input id="startDate" type="date" class="input" bind:value={startDate} />
			</div>
			<span class="date-arrow">→</span>
			<div class="form-group">
				<label class="label" for="endDate">End Date <span class="required">*</span></label>
				<input id="endDate" type="date" class="input" bind:value={endDate} />
			</div>
			{#if dayCount > 0}
				<div class="day-count">
					<span class="day-count-number">{dayCount}</span>
					<span class="day-count-label">{dayCount === 1 ? 'day' : 'days'}</span>
				</div>
			{/if}
		</div>

		{#if dateError}
			<div class="form-error">{dateError}</div>
		{/if}

		<div class="form-group">
			<label class="label" for="statusNote">Note</label>
			<input
				id="statusNote"
				type="text"
				class="input"
				bind:value={note}
				maxlength={200}
				placeholder="Optional note (e.g., JRTC rotation)"
			/>
		</div>
	</div>

	{#snippet footer()}
		<button class="btn btn-secondary" onclick={editingEntry ? cancelEdit : onClose}>
			{editingEntry ? 'Cancel Edit' : 'Cancel'}
		</button>
		<button class="btn btn-primary" onclick={handleSubmit} disabled={!selectedStatusId || !!dateError}>
			{editingEntry ? 'Update Status' : 'Add Status'}
		</button>
	{/snippet}
</Modal>

{#if removeEntryId}
	<ConfirmDialog
		title="Remove Status"
		message="Remove this status entry?"
		confirmLabel="Remove"
		variant="danger"
		onConfirm={doRemove}
		onCancel={() => (removeEntryId = null)}
	/>
{/if}

<style>
	.person-info {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		padding-bottom: var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
		margin-bottom: var(--spacing-md);
	}

	.person-name {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-lg);
	}

	.person-name .rank {
		font-weight: 700;
		color: var(--color-primary);
	}

	.person-name .name {
		font-weight: 600;
	}

	.clicked-date {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.existing-entries {
		margin-bottom: var(--spacing-md);
		padding-bottom: var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
	}

	.existing-entries h4,
	.add-section h4 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: var(--spacing-sm);
	}

	.entry-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-xs);
		border: 2px solid transparent;
		transition: border-color 0.15s;
	}

	.entry-item:last-child {
		margin-bottom: 0;
	}

	.entry-item.is-editing {
		border-color: var(--color-primary);
		background: var(--color-surface);
	}

	.entry-details {
		flex: 1;
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.entry-dates {
		font-size: var(--font-size-sm);
		font-weight: 500;
	}

	.entry-days {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.icon-btn {
		padding: var(--spacing-xs);
		flex-shrink: 0;
	}

	.status-select-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.status-select-row .select {
		flex: 1;
	}

	.date-range {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.date-range .form-group {
		flex: 1;
		margin-bottom: 0;
	}

	.date-arrow {
		color: var(--color-text-muted);
		font-size: var(--font-size-lg);
		padding-top: var(--spacing-lg);
	}

	.day-count {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		min-width: 50px;
		margin-top: var(--spacing-lg);
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

	.add-section {
		padding-top: var(--spacing-sm);
	}

	.entry-note {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		font-style: italic;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 120px;
	}
</style>
